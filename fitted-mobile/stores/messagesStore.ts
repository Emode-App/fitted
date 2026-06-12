import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../services/supabase';
import { Conversation, Message, User, PaymentRequest, StylingDelivery } from '../types';

// Upload a local image URI (or data: URI) to Supabase storage and return its public URL.
// Reused by both general chat images and face-photo sharing so neither sends a local-only URI.
async function uploadChatImage(conversationId: string, senderId: string, localUri: string): Promise<string | null> {
    try {
        let base64 = '';
        if (localUri.startsWith('data:')) {
            base64 = localUri.split(',')[1];
        } else {
            base64 = await FileSystem.readAsStringAsync(localUri, {
                encoding: FileSystem.EncodingType.Base64,
            });
        }

        const filename = `messages/${conversationId}/${senderId}_${Date.now()}.jpg`;
        const arrayBuffer = decode(base64);

        const { error } = await supabase.storage
            .from('posts')
            .upload(filename, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: false,
            });

        if (error) {
            console.error('Chat image upload error:', error);
            return null;
        }

        const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filename);
        return urlData.publicUrl;
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
                set({ messages: data as MessageWithUser[] });
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
        try {
            const paymentRequest: PaymentRequest = {
                type: 'request',
                amount,
                description,
                status: 'pending',
                currency: 'USD',
            };

            const { error } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: senderId,
                text: `Payment request: $${amount.toFixed(2)}`,
                payment_request: paymentRequest,
            });

            if (!error) {
                get().fetchMessages(conversationId);
            }
        } catch (error) {
            console.error('Error sending payment request:', error);
        }
    },

    respondToPayment: async (messageId: string, conversationId: string, responderId: string, action: 'accept' | 'decline') => {
        try {
            // Get the current message to access payment_request data
            const { messages } = get();
            const message = messages.find(m => m.id === messageId);
            if (!message?.payment_request) return;

            const newStatus = action === 'accept' ? 'completed' : 'failed';

            // Update the payment_request status on the message
            const updatedPaymentRequest: PaymentRequest = {
                ...message.payment_request,
                status: newStatus,
                transaction_id: action === 'accept' ? `sim_${Date.now()}` : undefined,
            };

            const { error: updateError } = await supabase
                .from('messages')
                .update({ payment_request: updatedPaymentRequest })
                .eq('id', messageId);

            if (updateError) {
                console.error('Error updating payment status:', updateError);
                return;
            }

            // If accepted, create a styling session record
            if (action === 'accept') {
                const { error: sessionError } = await supabase
                    .from('styling_sessions')
                    .insert({
                        stylist_id: message.sender_id,
                        client_id: responderId,
                        conversation_id: conversationId,
                        message_id: messageId,
                        amount: message.payment_request.amount,
                        description: message.payment_request.description,
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                    });

                if (sessionError) {
                    console.error('Error creating styling session:', sessionError);
                }
            }

            // Send a system-style follow-up message
            const statusText = action === 'accept'
                ? `✅ Payment of $${message.payment_request.amount.toFixed(2)} accepted`
                : `❌ Payment request declined`;

            await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: responderId,
                text: statusText,
            });

            // Refresh messages to show updated state
            get().fetchMessages(conversationId);
        } catch (error) {
            console.error('Error responding to payment:', error);
        }
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
            // If a local image was picked, upload it first so it persists across devices.
            // Already-hosted URLs (e.g. the user's saved ai_face_url) are sent as-is.
            let sharedUrl = faceUrl;
            if (!faceUrl.startsWith('http')) {
                const uploaded = await uploadChatImage(conversationId, senderId, faceUrl);
                if (!uploaded) return;
                sharedUrl = uploaded;
            }

            const { error } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: senderId,
                text: '📸 Shared face photo for styling',
                shared_face_url: sharedUrl,
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
