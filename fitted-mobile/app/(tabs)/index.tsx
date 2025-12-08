import { StyleSheet, FlatList, RefreshControl, ActivityIndicator, Modal, Pressable } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import PostItem from '@/components/PostItem';
import CommentsModal from '@/components/CommentsModal';
import { usePostsStore } from '@/stores/postsStore';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationsStore } from '@/stores/notificationsStore';

export default function FeedScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [commentsPost, setCommentsPost] = useState<{ id: string; user_id: string } | null>(null);

    const posts = usePostsStore((state) => state.posts);
    const isLoading = usePostsStore((state) => state.isLoading);
    const fetchPosts = usePostsStore((state) => state.fetchPosts);
    const toggleLike = usePostsStore((state) => state.toggleLike);
    const toggleSave = usePostsStore((state) => state.toggleSave);
    const setCurrentUserId = usePostsStore((state) => state.setCurrentUserId);
    const user = useAuthStore((state) => state.user);
    const unreadCount = useNotificationsStore((state) => state.unreadCount);
    const fetchNotifications = useNotificationsStore((state) => state.fetchNotifications);

    // Set current user ID for like tracking
    useEffect(() => {
        if (user?.id) {
            setCurrentUserId(user.id);
            fetchNotifications(user.id);
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
        // TODO: Share post
        console.log('Share post:', postId);
    };

    const handleSave = (postId: string) => {
        toggleSave(postId);
    };

    const handleUserPress = (userId: string) => {
        router.push({ pathname: '/user/[id]', params: { id: userId } });
    };

    if (isLoading && posts.length === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.logo}>fitted</Text>
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="large" />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.logo}>fitted</Text>
                <Pressable style={styles.bellButton} onPress={() => router.push('/activity')}>
                    <Feather name="bell" size={24} color="#fff" />
                    {unreadCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                        </View>
                    )}
                </Pressable>
            </View>

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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#000',
        borderBottomWidth: 0.5,
        borderBottomColor: '#222',
    },
    logo: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: -1,
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
    bellButton: {
        position: 'relative',
        padding: 4,
    },
    badge: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: '#ff3b5c',
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
});
