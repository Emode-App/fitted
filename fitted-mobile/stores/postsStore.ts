import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { Post, User } from '../types';

interface PostsState {
    posts: Post[];
    isLoading: boolean;
    error: string | null;
    currentUserId: string | null;

    // Actions
    setCurrentUserId: (userId: string) => void;
    fetchPosts: () => Promise<void>;
    fetchUserPosts: (userId: string) => Promise<Post[]>;
    fetchSavedPosts: (userId: string) => Promise<Post[]>;
    createPost: (post: Partial<Post>) => Promise<{ error?: string }>;
    toggleLike: (postId: string) => Promise<void>;
    toggleSave: (postId: string) => Promise<void>;
    deletePost: (postId: string) => Promise<void>;
}

export const usePostsStore = create<PostsState>((set, get) => ({
    posts: [],
    isLoading: false,
    error: null,
    currentUserId: null,

    setCurrentUserId: (userId) => set({ currentUserId: userId }),

    fetchPosts: async () => {
        set({ isLoading: true, error: null });
        try {
            const { currentUserId } = get();

            // Fetch posts with user info
            const { data, error } = await supabase
                .from('posts')
                .select(`
          *,
          user:users!posts_user_id_fkey(*)
        `)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            // Get likes for current user AND count likes for each post
            let likedPostIds: string[] = [];
            let savedPostIds: string[] = [];
            const likeCounts: Record<string, number> = {};

            if (data && data.length > 0) {
                const postIds = data.map(p => p.id);

                // Get all likes for these posts
                const { data: allLikes } = await supabase
                    .from('likes')
                    .select('post_id, user_id')
                    .in('post_id', postIds);

                // Count likes per post and track which ones current user liked
                (allLikes || []).forEach(like => {
                    likeCounts[like.post_id] = (likeCounts[like.post_id] || 0) + 1;
                    if (like.user_id === currentUserId) {
                        likedPostIds.push(like.post_id);
                    }
                });

                // Get saved posts for current user
                if (currentUserId) {
                    const { data: savedPosts } = await supabase
                        .from('saved_posts')
                        .select('post_id')
                        .eq('user_id', currentUserId)
                        .in('post_id', postIds);
                    savedPostIds = (savedPosts || []).map(s => s.post_id);
                }
            }

            // Transform to match our Post type - use counted likes, not stale likes_count
            const posts = (data || []).map((post: any) => ({
                ...post,
                user: post.user,
                is_liked: likedPostIds.includes(post.id),
                is_saved: savedPostIds.includes(post.id),
                likes_count: likeCounts[post.id] || 0, // Use fresh count from likes table
            }));

            set({ posts, isLoading: false });
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchUserPosts: async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('posts')
                .select(`
          *,
          user:users!posts_user_id_fkey(*)
        `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching user posts:', JSON.stringify(error, null, 2));
            return [];
        }
    },

    fetchSavedPosts: async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('saved_posts')
                .select(`
                    post_id,
                    post:posts!saved_posts_post_id_fkey(
                        *,
                        user:users!posts_user_id_fkey(*)
                    )
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            // Extract the post from each saved_posts row
            return (data || []).map((item: any) => item.post).filter(Boolean);
        } catch (error) {
            console.error('Error fetching saved posts:', JSON.stringify(error, null, 2));
            return [];
        }
    },

    createPost: async (post: Partial<Post>) => {
        try {
            const { error } = await supabase.from('posts').insert(post);
            if (error) return { error: error.message };

            // Refresh posts
            get().fetchPosts();
            return {};
        } catch (error: any) {
            return { error: error.message };
        }
    },

    toggleLike: async (postId: string) => {
        const { currentUserId, posts } = get();
        if (!currentUserId) return;

        // Find current post
        const post = posts.find(p => p.id === postId);
        if (!post) return;

        const isCurrentlyLiked = post.is_liked;
        const currentLikesCount = post.likes_count || 0;

        // Optimistic update - immediately update UI
        set({
            posts: posts.map(p =>
                p.id === postId
                    ? {
                        ...p,
                        is_liked: !isCurrentlyLiked,
                        likes_count: Math.max(0, currentLikesCount + (isCurrentlyLiked ? -1 : 1))
                    }
                    : p
            ),
        });

        try {
            if (isCurrentlyLiked) {
                // Unlike
                await supabase
                    .from('likes')
                    .delete()
                    .eq('post_id', postId)
                    .eq('user_id', currentUserId);

                // Delete the like notification if it exists
                if (post.user_id && post.user_id !== currentUserId) {
                    await supabase
                        .from('notifications')
                        .delete()
                        .eq('user_id', post.user_id)
                        .eq('actor_id', currentUserId)
                        .eq('type', 'like')
                        .eq('post_id', postId);
                }
            } else {
                // Like
                await supabase
                    .from('likes')
                    .insert({ post_id: postId, user_id: currentUserId });

                // Create notification for post owner (if not liking own post)
                // Use upsert to prevent duplicates
                if (post.user_id && post.user_id !== currentUserId) {
                    await supabase.from('notifications').upsert({
                        user_id: post.user_id,
                        actor_id: currentUserId,
                        type: 'like',
                        post_id: postId,
                    }, {
                        onConflict: 'user_id,actor_id,type,post_id',
                        ignoreDuplicates: true,
                    });
                }
            }

        } catch (error) {
            console.error('Error toggling like:', error);
            // Revert on error
            set({
                posts: posts.map(p =>
                    p.id === postId
                        ? { ...p, is_liked: isCurrentlyLiked, likes_count: currentLikesCount }
                        : p
                ),
            });
        }
    },

    toggleSave: async (postId: string) => {
        const { currentUserId, posts } = get();
        if (!currentUserId) return;

        // Find current post and its saved state
        const post = posts.find(p => p.id === postId);
        const isCurrentlySaved = post?.is_saved || false;

        // Optimistic update
        set({
            posts: posts.map(p =>
                p.id === postId
                    ? { ...p, is_saved: !isCurrentlySaved }
                    : p
            ),
        });

        try {
            if (isCurrentlySaved) {
                await supabase
                    .from('saved_posts')
                    .delete()
                    .eq('post_id', postId)
                    .eq('user_id', currentUserId);
            } else {
                await supabase
                    .from('saved_posts')
                    .insert({ post_id: postId, user_id: currentUserId });
            }
        } catch (error) {
            console.error('Error toggling save:', error);
            // Revert on error
            set({
                posts: posts.map(p =>
                    p.id === postId
                        ? { ...p, is_saved: isCurrentlySaved }
                        : p
                ),
            });
        }
    },

    deletePost: async (postId: string) => {
        const { posts } = get();

        // Optimistic removal
        set({ posts: posts.filter(p => p.id !== postId) });

        try {
            const { error } = await supabase
                .from('posts')
                .delete()
                .eq('id', postId);

            if (error) throw error;
        } catch (error) {
            console.error('Error deleting post:', error);
            // Revert on error
            set({ posts });
        }
    },
}));
