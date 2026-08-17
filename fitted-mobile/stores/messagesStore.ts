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
    isLoading: boolean;

    // Actions
    fetchConversations: (userId: string) => Promise<void>;
    fetchMessages: (conversationId: string) => Promise<void>;
    sendMessage: (conversationId: string, senderId: string, text: string) => Promise<void>;
    sendPaymentRequest: (conversationId: string, senderId: string, amount: number, description: string) => Promise<void>;
    respondToPayment: (messageId: string, conversationId: string, responderId: string, action: 'accept' | 'decline') => Promise<void>;
    sendStylingDelivery: (conversationId: string, senderId: string, delivery: StylingDelivery) => Promise<void>;
    sendFacePhoto: (conversationId: string, senderId: string, faceUrl: string) => Promise<void>;
    sendImage: (conversationId: string, senderId: string, localUri: string) => Promise<boolean>;
    createConversation: (userId: string, otherUserId: string) => Promise<string | null>;
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

export const useMessagesStore = create<MessagesState>((set, get) => ({
    conversations: [],
    activeConversation: null,
    messages: [],
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

                    return {
                        ...convo,
                        otherUser: otherUser || {},
                        lastMessage: lastMessages?.[0],
                    };
                })
            );

            set({ conversations: conversationsWithDetails, isLoading: false });
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

            if (!error && data) {
                // Resolve private media (DM images + shared face photos) to
                // short-lived signed URLs. Legacy public URLs pass through unchanged.
                const resolved = await Promise.all(
                    (data as MessageWithUser[]).map(async (m) => ({
                        ...m,
                        image_url: m.image_url ? (await getSignedUrl(m.image_url)) || undefined : m.image_url,
                        shared_face_url: m.shared_face_url ? (await getSignedUrl(m.shared_face_url)) || undefined : m.shared_face_url,
                    }))
                );
                set({ messages: resolved as MessageWithUser[] });
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    },

    sendMessage: async (conversationId: string, senderId: string, text: string) => {
        try {
            const { error } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: senderId,
                text,
            });

            if (!error) {
                // Refresh messages
                get().fetchMessages(conversationId);
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

    sendStylingDelivery: async (conversationId: string, senderId: string, delivery: StylingDelivery) => {
        try {
            const itemCount = delivery.items.length;
            const { error } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: senderId,
                text: `🎨 Outfit delivery — ${itemCount} item${itemCount !== 1 ? 's' : ''} styled`,
                styling_delivery: delivery,
            });

            if (!error) {
                get().fetchMessages(conversationId);
            }
        } catch (error) {
            console.error('Error sending styling delivery:', error);
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
}));
