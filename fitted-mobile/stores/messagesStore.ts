import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../services/supabase';
import { PRIVATE_BUCKET, getSignedUrl } from '../services/privateMedia';
import { Conversation, Message, User, PaymentRequest, StylingDelivery } from '../types';

// Upload a chat image (local file, data: URI, or an http/signed URL we need to
// copy) into the PRIVATE bucket under the conversation's folder, and return the
// stored object PATH (not a URL). Only conversation participants can read it,
// and we sign the path on read. Used for general chat images and face sharing.
async function uploadChatImage(conversationId: string, senderId: string, sourceUri: string): Promise<string | null> {
    try {
        let arrayBuffer: ArrayBuffer;
        if (sourceUri.startsWith('data:')) {
            arrayBuffer = decode(sourceUri.split(',')[1]);
        } else if (/^https?:/.test(sourceUri)) {
            // Copy a remote/signed URL into the conversation folder so we never
            // persist an expiring URL and the recipient can always read it.
            const res = await fetch(sourceUri);
            arrayBuffer = await res.arrayBuffer();
        } else {
            const base64 = await FileSystem.readAsStringAsync(sourceUri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            arrayBuffer = decode(base64);
        }

        const path = `messages/${conversationId}/${senderId}_${Date.now()}.jpg`;

        const { error } = await supabase.storage
            .from(PRIVATE_BUCKET)
            .upload(path, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: false,
            });

        if (error) {
            console.error('Chat image upload error:', error);
            return null;
        }

        return path;
    } catch (error) {
        console.error('Chat image upload error:', error);
        return null;
    }
}

interface MessagesState {
    conversations: ConversationWithDetails[];
    activeConversation: ConversationWithDetails | null;
    messages: MessageWithUser[];
    /** Every unread message across every thread, for the tab and icon badges. */
    unreadTotal: number;
    isLoading: boolean;

    // Actions
    fetchConversations: (userId: string) => Promise<void>;
    fetchMessages: (conversationId: string) => Promise<void>;
    sendMessage: (conversationId: string, senderId: string, text: string) => Promise<void>;
    sendPaymentRequest: (conversationId: string, senderId: string, amount: number, description: string) => Promise<void>;
    respondToPayment: (messageId: string, conversationId: string, responderId: string, action: 'accept' | 'decline') => Promise<void>;
    /** Resolves to the new message id, or null if the insert failed. */
    sendStylingDelivery: (conversationId: string, senderId: string, delivery: StylingDelivery) => Promise<string | null>;
    sendFacePhoto: (conversationId: string, senderId: string, faceUrl: string) => Promise<void>;
    sendImage: (conversationId: string, senderId: string, localUri: string) => Promise<boolean>;
    /** Hide for yourself only. The other person still sees it. Resolves to an error string, or null. */
    hideMessage: (messageId: string) => Promise<string | null>;
    /** Unsend: removes the message for both people. Resolves to an error string, or null on success. */
    deleteMessage: (messageId: string) => Promise<string | null>;
    createConversation: (userId: string, otherUserId: string) => Promise<string | null>;
    /** Mark everything the other person sent in this thread as read. */
    markConversationRead: (conversationId: string, userId: string) => Promise<void>;
    setActiveConversation: (conversation: ConversationWithDetails | null) => void;
}

interface ConversationWithDetails extends Conversation {
    otherUser: User;
    lastMessage?: Message;
    unreadCount?: number;
}

interface MessageWithUser extends Message {
    sender: User;
}

// Newest activity first.
//
// The query orders by conversations.created_at, which is when the thread was
// started -- so a conversation you messaged a minute ago stayed wherever it was
// first created, and the person you talk to most sank to the bottom. What
// matters is when something last happened in it.
//
// An empty conversation has no last message, so it falls back to when it was
// created. That keeps a thread you have just opened at the top, where you left
// it, rather than at the bottom until somebody says something.
const byRecentActivity = (a: ConversationWithDetails, b: ConversationWithDetails) => {
    const at = new Date(a.lastMessage?.created_at ?? a.created_at).getTime();
    const bt = new Date(b.lastMessage?.created_at ?? b.created_at).getTime();
    return bt - at;
};

/** One number for the tab bar and the app icon, from the per-thread counts. */
const totalUnread = (conversations: ConversationWithDetails[]) =>
    conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

export const useMessagesStore = create<MessagesState>((set, get) => ({
    conversations: [],
    activeConversation: null,
    messages: [],
    unreadTotal: 0,
    isLoading: false,

    fetchConversations: async (userId: string) => {
        set({ isLoading: true });
        try {
            // Get conversations where user is a participant
            const { data: convos, error } = await supabase
                .from('conversations')
                .select('*')
                .contains('participant_ids', [userId])
                .order('created_at', { ascending: false });

            if (error || !convos) {
                set({ isLoading: false });
                return;
            }

            // For each conversation, get the other user and last message
            const conversationsWithDetails: ConversationWithDetails[] = await Promise.all(
                convos.map(async (convo) => {
                    const otherUserId = convo.participant_ids.find((id: string) => id !== userId);

                    // Get other user
                    const { data: otherUser } = await supabase
                        .from('users')
                        .select('*')
                        .eq('id', otherUserId)
                        .single();

                    // Get last message
                    const { data: lastMessages } = await supabase
                        .from('messages')
                        .select('*')
                        .eq('conversation_id', convo.id)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    // Unread means: they sent it, and we have not opened the
                    // thread since. head + exact asks Postgres for the number
                    // and not the rows, so this stays one small round trip even
                    // on a thread with thousands of messages in it.
                    const { count: unreadCount } = await supabase
                        .from('messages')
                        .select('id', { count: 'exact', head: true })
                        .eq('conversation_id', convo.id)
                        .neq('sender_id', userId)
                        .eq('is_read', false);

                    return {
                        ...convo,
                        otherUser: otherUser || {},
                        lastMessage: lastMessages?.[0],
                        unreadCount: unreadCount ?? 0,
                    };
                })
            );

            set({
                conversations: conversationsWithDetails.sort(byRecentActivity),
                unreadTotal: totalUnread(conversationsWithDetails),
                isLoading: false,
            });
        } catch (error) {
            console.error('Error fetching conversations:', error);
            set({ isLoading: false });
        }
    },

    fetchMessages: async (conversationId: string) => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select(`
          *,
          sender:users!messages_sender_id_fkey(*)
        `)
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });

            // Messages this person hid for themselves. Filtered here rather
            // than in the query, because the hidden list is private and a join
            // against it would leak nothing useful but complicate the policy.
            const { data: hidden } = await supabase
                .from('hidden_messages')
                .select('message_id');
            const hiddenIds = new Set((hidden ?? []).map((h: any) => h.message_id));

            if (!error && data) {
                // Resolve private media (DM images, shared face photos, and the
                // face-derived styling deliveries) to short-lived signed URLs.
                // Legacy public URLs pass through unchanged.
                const resolved = await Promise.all(
                    (data as MessageWithUser[]).map(async (m) => {
                        const delivery = m.styling_delivery
                            ? {
                                ...m.styling_delivery,
                                generated_image_url: (await getSignedUrl(m.styling_delivery.generated_image_url)) || m.styling_delivery.generated_image_url,
                                board_image_url: m.styling_delivery.board_image_url
                                    ? (await getSignedUrl(m.styling_delivery.board_image_url)) || undefined
                                    : m.styling_delivery.board_image_url,
                            }
                            : m.styling_delivery;
                        return {
                            ...m,
                            image_url: m.image_url ? (await getSignedUrl(m.image_url)) || undefined : m.image_url,
                            shared_face_url: m.shared_face_url ? (await getSignedUrl(m.shared_face_url)) || undefined : m.shared_face_url,
                            styling_delivery: delivery,
                        };
                    })
                );
                set({ messages: (resolved as MessageWithUser[]).filter((m) => !hiddenIds.has(m.id)) });
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    },

    sendMessage: async (conversationId: string, senderId: string, text: string) => {
        try {
            const { data, error } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: senderId,
                text,
            }).select('*').single();

            if (!error) {
                get().fetchMessages(conversationId);

                // The conversation list quotes the last message, and this only
                // ever refreshed the thread -- so the preview kept showing what
                // the other person had said last, until the app was restarted
                // and the list was fetched again from scratch. Patched here
                // rather than refetched: the row was just written, so what it
                // says is already known.
                set({
                    conversations: get().conversations
                        .map((c) => (c.id === conversationId ? { ...c, lastMessage: data as Message } : c))
                        // Re-sorted with the same comparator, so the thread you
                        // just replied to jumps to the top straight away rather
                        // than waiting for the next fetch to notice.
                        .sort(byRecentActivity),
                });
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    },

    sendPaymentRequest: async (conversationId: string, senderId: string, amount: number, description: string) => {
        void conversationId; void senderId; void amount; void description;
        console.warn('Paid styling requests are disabled in this release.');
    },

    respondToPayment: async (messageId: string, conversationId: string, responderId: string, action: 'accept' | 'decline') => {
        void messageId; void conversationId; void responderId; void action;
        console.warn('Paid styling requests are disabled in this release.');
    },

    // Returns the new message id so the caller can hand it to the styling-session
    // function, which captures payment against that specific delivery.
    hideMessage: async (messageId: string) => {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) return 'Sign in to hide messages';

        const previous = get().messages;
        set({ messages: previous.filter((m) => m.id !== messageId) });

        const { error } = await supabase
            .from('hidden_messages')
            .insert({ user_id: userId, message_id: messageId });

        // Already hidden is the state we wanted, not a failure.
        if (error && error.code !== '23505') {
            set({ messages: previous });
            return error.message || 'Could not hide that message';
        }
        return null;
    },

    deleteMessage: async (messageId: string) => {
        // Gone from the list first, so the bubble does not sit there looking
        // undeleted while the round trip finishes. Put back if the server
        // refuses, rather than leaving the two views disagreeing.
        const previous = get().messages;
        set({ messages: previous.filter((m) => m.id !== messageId) });

        const { error } = await supabase.from('messages').delete().eq('id', messageId);

        if (error) {
            set({ messages: previous });
            return error.message || 'Could not unsend that message';
        }

        // The conversation list shows the last message, and it has just
        // changed. Without this the preview keeps quoting something that no
        // longer exists in the thread.
        const conversation = get().activeConversation;
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (conversation && userId) await get().fetchConversations(userId);

        return null;
    },

    sendStylingDelivery: async (conversationId: string, senderId: string, delivery: StylingDelivery) => {
        try {
            const itemCount = delivery.items.length;
            const { data, error } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: senderId,
                text: `🎨 Outfit delivery — ${itemCount} item${itemCount !== 1 ? 's' : ''} styled`,
                styling_delivery: delivery,
            }).select('id').single();

            if (error) throw error;
            get().fetchMessages(conversationId);
            return data?.id ?? null;
        } catch (error) {
            console.error('Error sending styling delivery:', error);
            return null;
        }
    },

    sendFacePhoto: async (conversationId: string, senderId: string, faceUrl: string) => {
        try {
            // Always copy the face into the conversation's private folder so the
            // recipient (stylist) can read it via storage RLS, and we never persist
            // an expiring signed URL. Stores the object path; signed on read.
            const storedPath = await uploadChatImage(conversationId, senderId, faceUrl);
            if (!storedPath) return;

            const { error } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: senderId,
                text: '📸 Shared face photo for styling',
                shared_face_url: storedPath,
            });

            if (!error) {
                get().fetchMessages(conversationId);
            }
        } catch (error) {
            console.error('Error sending face photo:', error);
        }
    },

    sendImage: async (conversationId: string, senderId: string, localUri: string) => {
        try {
            const publicUrl = await uploadChatImage(conversationId, senderId, localUri);
            if (!publicUrl) return false;

            const { error } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: senderId,
                text: '📷 Photo',
                image_url: publicUrl,
            });

            if (error) {
                console.error('Error sending image:', error);
                return false;
            }

            get().fetchMessages(conversationId);
            return true;
        } catch (error) {
            console.error('Error sending image:', error);
            return false;
        }
    },

    createConversation: async (userId: string, otherUserId: string) => {
        try {
            // Check if conversation already exists
            const { data: existing } = await supabase
                .from('conversations')
                .select('*')
                .contains('participant_ids', [userId, otherUserId]);

            if (existing && existing.length > 0) {
                return existing[0].id;
            }

            // Create new conversation
            const { data, error } = await supabase
                .from('conversations')
                .insert({
                    participant_ids: [userId, otherUserId],
                })
                .select()
                .single();

            if (error) return null;
            return data.id;
        } catch (error) {
            console.error('Error creating conversation:', error);
            return null;
        }
    },

    setActiveConversation: (conversation) => set({ activeConversation: conversation }),

    markConversationRead: async (conversationId: string, userId: string) => {
        // Only the other person's messages. Marking your own read is
        // meaningless, and since the migration the client may write is_read and
        // nothing else on this table, so a wider update would be refused rather
        // than quietly doing something surprising.
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('conversation_id', conversationId)
            .neq('sender_id', userId)
            .eq('is_read', false);

        if (error) {
            // The thread still opens and still reads correctly; only the count
            // is stale, and the next fetch settles it.
            console.warn('Could not mark conversation read:', error.message);
            return;
        }

        set((state) => {
            const conversations = state.conversations.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c
            );
            return { conversations, unreadTotal: totalUnread(conversations) };
        });
    },
}));
