import { StyleSheet, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';

import { Text, View } from '@/components/Themed';
import { useNotificationsStore } from '@/stores/notificationsStore';
import { useAuthStore } from '@/stores/authStore';
import { Notification } from '@/types';
import { useTheme } from '@/hooks/useTheme';

interface NotificationWithDetails {
    id: string;
    user_id: string;
    actor_id: string;
    type: 'like' | 'comment' | 'follow';
    post_id?: string;
    comment_id?: string;
    is_read: boolean;
    created_at: string;
    actor: {
        id: string;
        username: string;
        avatar_url?: string;
    };
    post?: {
        id: string;
        generated_image: string;
    };
    content?: string; // Comment text for comment notifications
}

export default function ActivityScreen() {
    const { colors } = useTheme();
    const [refreshing, setRefreshing] = useState(false);
    const user = useAuthStore((state) => state.user);
    const notifications = useNotificationsStore((state) => state.notifications) as NotificationWithDetails[];
    const isLoading = useNotificationsStore((state) => state.isLoading);
    const fetchNotifications = useNotificationsStore((state) => state.fetchNotifications);
    const markAsRead = useNotificationsStore((state) => state.markAsRead);
    const markAllAsRead = useNotificationsStore((state) => state.markAllAsRead);

    useFocusEffect(
        useCallback(() => {
            if (user?.id) {
                // Fetch first, then mark as read to ensure we have data and avoid race conditions
                fetchNotifications(user.id).then(() => {
                    markAllAsRead(user.id);
                });
            }
        }, [user])
    );


    const onRefresh = async () => {
        if (!user?.id) return;
        setRefreshing(true);
        await fetchNotifications(user.id);
        setRefreshing(false);
    };

    const handleNotificationPress = (notification: NotificationWithDetails) => {
        // Mark as read
        if (!notification.is_read) {
            markAsRead(notification.id);
        }

        // Navigate based on type
        if (notification.type === 'follow') {
            // Follow notification -> go to follower's profile
            router.push({ pathname: '/user/[id]', params: { id: notification.actor_id } });
        } else if (notification.post_id) {
            // Like/Comment notification -> go to the post
            // TODO: Navigate to post detail screen when implemented
            // For now navigate to the post owner's profile (which shows their posts)
            router.push({ pathname: '/user/[id]', params: { id: notification.actor_id } });
        }
    };

    const handleActorPress = (actorId: string) => {
        router.push({ pathname: '/user/[id]', params: { id: actorId } });
    };

    const formatTime = (timestamp: string): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'now';
        if (minutes < 60) return `${minutes}m`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;

        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d`;

        return `${Math.floor(days / 7)}w`;
    };

    const getNotificationText = (notification: NotificationWithDetails): string => {
        switch (notification.type) {
            case 'like':
                return 'liked your post';
            case 'comment':
                if (notification.content) {
                    const truncated = notification.content.length > 50
                        ? notification.content.slice(0, 50) + '...'
                        : notification.content;
                    return `commented: "${truncated}"`;
                }
                return 'commented on your post';
            case 'follow':
                return 'started following you';
            default:
                return '';
        }
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'like':
                return <Ionicons name="heart" size={16} color="#ff3b5c" />;
            case 'comment':
                return <Feather name="message-circle" size={16} color="#0095f6" />;
            case 'follow':
                return <Feather name="user-plus" size={16} color="#8b5cf6" />;
            default:
                return null;
        }
    };

    const renderNotification = ({ item }: { item: NotificationWithDetails }) => (
        <Pressable
            style={[
                styles.notificationItem,
                { borderBottomColor: colors.border },
                !item.is_read && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => handleNotificationPress(item)}
        >
            <Pressable onPress={() => handleActorPress(item.actor_id)}>
                {item.actor?.avatar_url ? (
                    <Image source={{ uri: item.actor.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                        <Feather name="user" size={18} color={colors.textSecondary} />
                    </View>
                )}
            </Pressable>

            <View style={styles.content}>
                <Text style={[styles.text, { color: colors.text }]}>
                    <Text
                        style={[styles.username, { color: colors.text }]}
                        onPress={() => handleActorPress(item.actor_id)}
                    >
                        {item.actor?.username || 'Someone'}
                    </Text>
                    {' '}{getNotificationText(item)}
                </Text>
                <View style={styles.meta}>
                    {getNotificationIcon(item.type)}
                    <Text style={[styles.time, { color: colors.textSecondary }]}>{formatTime(item.created_at)}</Text>
                </View>
            </View>

            {item.post?.generated_image && (
                <Image source={{ uri: item.post.generated_image }} style={styles.postThumb} />
            )}
        </Pressable>
    );

    if (isLoading && notifications.length === 0) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                    <Text style={[styles.title, { color: colors.text }]}>Activity</Text>
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.text} size="large" />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                <Text style={[styles.title, { color: colors.text }]}>Activity</Text>
                {notifications.some(n => !n.is_read) && (
                    <Pressable onPress={() => user && markAllAsRead(user.id)}>
                        <Text style={[styles.markRead, { color: colors.primary }]}>Mark all read</Text>
                    </Pressable>
                )}
            </View>

            <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={renderNotification}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.text}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="bell-off" size={48} color={colors.textSecondary} />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                            When someone likes, comments, or follows you, it'll show up here
                        </Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    markRead: {
        fontSize: 14,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 0.5,
    },
    unread: {
        // Handled inline with colors.backgroundSecondary
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    avatarPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        marginLeft: 12,
        backgroundColor: 'transparent',
    },
    text: {
        fontSize: 14,
        lineHeight: 20,
    },
    username: {
        fontWeight: '600',
    },
    meta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 6,
        backgroundColor: 'transparent',
    },
    time: {
        fontSize: 12,
    },
    postThumb: {
        width: 44,
        height: 44,
        borderRadius: 4,
        marginLeft: 12,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
    },
});
