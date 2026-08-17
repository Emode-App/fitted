import { StyleSheet, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { Text, View } from '@/components/Themed';
import PostItem from '@/components/PostItem';
import CommentsModal from '@/components/CommentsModal';
import { usePostsStore } from '@/stores/postsStore';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/hooks/useTheme';

export default function FeedScreen() {
    const { colors } = useTheme();
    const [refreshing, setRefreshing] = useState(false);
    const [commentsPost, setCommentsPost] = useState<{ id: string; user_id: string } | null>(null);

    const posts = usePostsStore((state) => state.posts);
    const isLoading = usePostsStore((state) => state.isLoading);
    const fetchPosts = usePostsStore((state) => state.fetchPosts);
    const toggleLike = usePostsStore((state) => state.toggleLike);
    const toggleSave = usePostsStore((state) => state.toggleSave);
    const setCurrentUserId = usePostsStore((state) => state.setCurrentUserId);
    const user = useAuthStore((state) => state.user);

    useEffect(() => {
        if (user?.id) {
            setCurrentUserId(user.id);
        }
    }, [user]);

    // Fetch posts when tab comes into focus
    useFocusEffect(
        useCallback(() => {
            fetchPosts();
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchPosts();
        setRefreshing(false);
    }, []);

    const handleLike = (postId: string) => {
        toggleLike(postId);
    };

    const handleComment = (post: { id: string; user_id: string }) => {
        setCommentsPost(post);
    };

    const handleShare = (postId: string) => {
        // Navigate to messages tab to share with someone
        router.push('/(tabs)/messages');
    };

    const handleSave = (postId: string) => {
        toggleSave(postId);
    };

    const handleUserPress = (userId: string) => {
        router.push({ pathname: '/user/[id]', params: { id: userId } });
    };

    const handleDelete = async (postId: string) => {
        const deletePost = usePostsStore.getState().deletePost;
        await deletePost(postId);
    };

    if (isLoading && posts.length === 0) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.text} size="large" />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            <FlatList
                data={posts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <PostItem
                        post={item}
                        onLike={() => handleLike(item.id)}
                        onComment={() => handleComment({ id: item.id, user_id: item.user_id })}
                        onShare={() => handleShare(item.id)}
                        onSave={() => handleSave(item.id)}
                        onUserPress={() => handleUserPress(item.user_id)}
                        onPostPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                        onDelete={() => handleDelete(item.id)}
                        onBlocked={(blockedId) => usePostsStore.getState().removeUserFromFeed(blockedId)}
                        currentUserId={user?.id}
                    />
                )}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#fff"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyTitle}>No fits yet</Text>
                        <Text style={styles.emptyText}>
                            Be the first to share a fit!
                        </Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />

            {/* Comments Modal */}
            <CommentsModal
                postId={commentsPost?.id || ''}
                postOwnerId={commentsPost?.user_id}
                visible={!!commentsPost}
                onClose={() => setCommentsPost(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 100,
        backgroundColor: 'transparent',
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
});

