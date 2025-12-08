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

interface NotificationWithDetails extends Notification {
    actor: {
        id: string;
        username: string;
        avatar_url?: string;
    };
    post?: {
        id: string;
        generated_image: string;
    };
}

export default function ActivityScreen() {
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
                fetchNotifications(user.id);
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
            router.push({ pathname: '/user/[id]', params: { id: notification.actor_id } });
        } else if (notification.post_id) {
            // For likes/comments, could navigate to post detail
            // For now, navigate to actor's profile
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
            style={[styles.notificationItem, !item.is_read && styles.unread]}
            onPress={() => handleNotificationPress(item)}
        >
            <Pressable onPress={() => handleActorPress(item.actor_id)}>
                {item.actor?.avatar_url ? (
                    <Image source={{ uri: item.actor.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Feather name="user" size={18} color="#666" />
                    </View>
                )}
            </Pressable>

            <View style={styles.content}>
                <Text style={styles.text}>
                    <Text style={styles.username}>{item.actor?.username || 'Someone'}</Text>
                    {' '}{getNotificationText(item)}
                </Text>
                <View style={styles.meta}>
                    {getNotificationIcon(item.type)}
                    <Text style={styles.time}>{formatTime(item.created_at)}</Text>
                </View>
            </View>

            {item.post?.generated_image && (
                <Image source={{ uri: item.post.generated_image }} style={styles.postThumb} />
            )}
        </Pressable>
    );

    if (isLoading && notifications.length === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Activity</Text>
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
                <Text style={styles.title}>Activity</Text>
                {notifications.some(n => !n.is_read) && (
                    <Pressable onPress={() => user && markAllAsRead(user.id)}>
                        <Text style={styles.markRead}>Mark all read</Text>
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
                        tintColor="#fff"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="bell-off" size={48} color="#333" />
                        <Text style={styles.emptyTitle}>No notifications yet</Text>
                        <Text style={styles.emptySubtitle}>
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
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    markRead: {
        color: '#0095f6',
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
        borderBottomColor: '#222',
    },
    unread: {
        backgroundColor: 'rgba(255,255,255,0.03)',
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
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        marginLeft: 12,
        backgroundColor: 'transparent',
    },
    text: {
        color: '#fff',
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
        color: '#666',
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
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtitle: {
        color: '#666',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
    },
});
