import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { Notification, User, Post } from '../types';

interface NotificationWithDetails extends Notification {
    actor: User;
    post?: Post;
}

interface NotificationsState {
    notifications: NotificationWithDetails[];
    unreadCount: number;
    isLoading: boolean;

    // Actions
    fetchNotifications: (userId: string) => Promise<void>;
    markAsRead: (notificationId: string) => Promise<void>;
    markAllAsRead: (userId: string) => Promise<void>;
    createNotification: (notification: Partial<Notification>) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,

    fetchNotifications: async (userId: string) => {
        set({ isLoading: true });
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select(`
                    *,
                    actor:users!notifications_actor_id_fkey(*),
                    post:posts!notifications_post_id_fkey(
                        id,
                        generated_image,
                        caption
                    )
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            const notifications = (data || []) as NotificationWithDetails[];
            const unreadCount = notifications.filter(n => !n.is_read).length;

            set({ notifications, unreadCount, isLoading: false });
        } catch (error) {
            console.error('Error fetching notifications:', JSON.stringify(error, null, 2));
            set({ isLoading: false });
        }
    },

    markAsRead: async (notificationId: string) => {
        try {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId);

            set((state) => ({
                notifications: state.notifications.map(n =>
                    n.id === notificationId ? { ...n, is_read: true } : n
                ),
                unreadCount: Math.max(0, state.unreadCount - 1),
            }));
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    },

    markAllAsRead: async (userId: string) => {
        try {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false);

            set((state) => ({
                notifications: state.notifications.map(n => ({ ...n, is_read: true })),
                unreadCount: 0,
            }));
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    },

    createNotification: async (notification: Partial<Notification>) => {
        try {
            // Don't create notification if actor is the same as recipient
            if (notification.actor_id === notification.user_id) return;

            await supabase.from('notifications').insert(notification);
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    },
}));
