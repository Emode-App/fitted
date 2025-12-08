import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { Conversation, Message, User } from '../types';

interface MessagesState {
    conversations: ConversationWithDetails[];
    activeConversation: ConversationWithDetails | null;
    messages: MessageWithUser[];
    isLoading: boolean;

    // Actions
    fetchConversations: (userId: string) => Promise<void>;
    fetchMessages: (conversationId: string) => Promise<void>;
    sendMessage: (conversationId: string, senderId: string, text: string) => Promise<void>;
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
