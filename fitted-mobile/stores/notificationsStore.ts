import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { Notification, User, Post } from '../types';

interface NotificationWithDetails extends Notification {
    actor: User;
    post?: Post;
}

/**
 * Enough of a person to draw an activity row: their avatar, their name, and
 * the marks that go beside it. The three flags are optional because these rows
 * are assembled from three separate queries and a caller that has not widened
 * its select simply draws no marks rather than failing to compile.
 */
export interface ActivityActor {
    id: string;
    username: string;
    avatar_url?: string;
    is_verified_stylist?: boolean | null;
    is_business_account?: boolean | null;
    is_verified_boutique?: boolean | null;
}

// A single activity event performed BY someone the current user follows
// (old-Instagram "Following" tab). Aggregated from likes/follows/comments.
export interface FollowingActivityItem {
    id: string;
    type: 'like' | 'follow' | 'comment';
    created_at: string;
    actor: ActivityActor;
    target_user?: ActivityActor; // for follow events
    post?: { id: string; generated_image?: string };
    content?: string; // comment text
}

interface NotificationsState {
    notifications: NotificationWithDetails[];
    unreadCount: number;
    isLoading: boolean;
    followingActivity: FollowingActivityItem[];
    isLoadingFollowing: boolean;

    // Actions
    fetchNotifications: (userId: string) => Promise<void>;
    fetchFollowingActivity: (userId: string) => Promise<void>;
    markAsRead: (notificationId: string) => Promise<void>;
    markAllAsRead: (userId: string) => Promise<void>;
    createNotification: (notification: Partial<Notification>) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    followingActivity: [],
    isLoadingFollowing: false,

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

    fetchFollowingActivity: async (userId: string) => {
        set({ isLoadingFollowing: true });
        try {
            // Who does the current user follow?
            const { data: followingRows } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', userId);

            const followingIds = (followingRows || []).map((r: any) => r.following_id);
            if (followingIds.length === 0) {
                set({ followingActivity: [], isLoadingFollowing: false });
                return;
            }

            // Pull recent activity performed BY those users across likes, follows, and comments
            const [likesRes, followsRes, commentsRes] = await Promise.all([
                supabase
                    .from('likes')
                    .select(`created_at, actor:users!likes_user_id_fkey(id, username, avatar_url, is_verified_stylist, is_business_account, is_verified_boutique), post:posts!likes_post_id_fkey(id, generated_image)`)
                    .in('user_id', followingIds)
                    .order('created_at', { ascending: false })
                    .limit(30),
                supabase
                    .from('follows')
                    .select(`created_at, actor:users!follows_follower_id_fkey(id, username, avatar_url, is_verified_stylist, is_business_account, is_verified_boutique), target_user:users!follows_following_id_fkey(id, username, avatar_url, is_verified_stylist, is_business_account, is_verified_boutique)`)
                    .in('follower_id', followingIds)
                    .order('created_at', { ascending: false })
                    .limit(30),
                supabase
                    .from('comments')
                    .select(`id, text, created_at, actor:users!comments_user_id_fkey(id, username, avatar_url, is_verified_stylist, is_business_account, is_verified_boutique), post:posts!comments_post_id_fkey(id, generated_image)`)
                    .in('user_id', followingIds)
                    .order('created_at', { ascending: false })
                    .limit(30),
            ]);

            const items: FollowingActivityItem[] = [];

            (likesRes.data || []).forEach((l: any) => {
                if (!l.actor) return;
                items.push({
                    id: `like_${l.actor.id}_${l.post?.id}_${l.created_at}`,
                    type: 'like',
                    created_at: l.created_at,
                    actor: l.actor,
                    post: l.post || undefined,
                });
            });

            (followsRes.data || []).forEach((f: any) => {
                if (!f.actor || !f.target_user) return;
                // Skip "X started following you" — that already lives in the "You" tab
                if (f.target_user.id === userId) return;
                items.push({
                    id: `follow_${f.actor.id}_${f.target_user.id}_${f.created_at}`,
                    type: 'follow',
                    created_at: f.created_at,
                    actor: f.actor,
                    target_user: f.target_user,
                });
            });

            (commentsRes.data || []).forEach((c: any) => {
                if (!c.actor) return;
                items.push({
                    id: `comment_${c.id}`,
                    type: 'comment',
                    created_at: c.created_at,
                    actor: c.actor,
                    post: c.post || undefined,
                    content: c.text,
                });
            });

            items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            set({ followingActivity: items.slice(0, 50), isLoadingFollowing: false });
        } catch (error) {
            console.error('Error fetching following activity:', JSON.stringify(error, null, 2));
            set({ isLoadingFollowing: false });
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
