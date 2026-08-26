import React, { useState } from 'react';
import { AppState } from 'react-native';
import { Tabs } from 'expo-router';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useNotificationsStore } from '@/stores/notificationsStore';
import { useMessagesStore } from '@/stores/messagesStore';
import { setAppIconBadge } from '@/services/pushNotifications';
import { useAuthStore } from '@/stores/authStore';
import SettingsDrawer from '@/components/SettingsDrawer';

export default function TabLayout() {
    const { colors, isDark } = useTheme();
    const unreadCount = useNotificationsStore((state) => state.unreadCount);
    const fetchNotifications = useNotificationsStore((state) => state.fetchNotifications);
    const messagesUnread = useMessagesStore((state) => state.unreadTotal);
    const fetchConversations = useMessagesStore((state) => state.fetchConversations);
    const { user } = useAuthStore();
    const [showSettings, setShowSettings] = useState(false);

    // Both counts, for the bell and for the messages tab. The messages screen
    // refetches its own conversations when it takes focus, but the badge has to
    // be right before anyone goes there, so the count is fetched here too.
    const refreshCounts = React.useCallback(() => {
        if (!user?.id) return;
        fetchNotifications(user.id);
        fetchConversations(user.id);
    }, [user?.id, fetchNotifications, fetchConversations]);

    React.useEffect(refreshCounts, [refreshCounts]);

    // Coming back from the background is the moment the counts are most likely
    // to be wrong: messages arrived as pushes while the app was not running, and
    // nothing in the tree refetched. Without this the badge stays at whatever it
    // was when the app was last put down.
    React.useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') refreshCounts();
        });
        return () => sub.remove();
    }, [refreshCounts]);

    // One number on the icon for both kinds of unread, because iOS only gives
    // us the one. Signed out it goes to zero rather than keeping a stale count
    // from whoever was signed in before.
    React.useEffect(() => {
        setAppIconBadge(user?.id ? unreadCount + messagesUnread : 0);
    }, [user?.id, unreadCount, messagesUnread]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Persistent Header */}
            <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                <Pressable style={styles.headerButton} onPress={() => router.push('/activity')}>
                    <Feather name="bell" size={24} color={colors.text} />
                    {unreadCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                        </View>
                    )}
                </Pressable>
                <Text style={[styles.logo, { color: colors.text }]}>EMODE.</Text>
                <Pressable style={styles.headerButton} onPress={() => setShowSettings(true)}>
                    <Feather name="menu" size={24} color={colors.text} />
                </Pressable>
            </View>

            {/* Tabs */}
            <Tabs
                screenOptions={{
                    tabBarActiveTintColor: colors.tabActive,
                    tabBarInactiveTintColor: colors.tabInactive,
                    tabBarStyle: {
                        backgroundColor: colors.tabBar,
                        borderTopColor: colors.tabBarBorder,
                        borderTopWidth: 0.5,
                        height: 85,
                        paddingBottom: 30,
                        paddingTop: 10,
                    },
                    tabBarShowLabel: false,
                    headerShown: false,
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: 'Feed',
                        tabBarIcon: ({ color, focused }) => (
                            <Feather name="home" size={28} color={color} strokeWidth={focused ? 2.5 : 2} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="explore"
                    options={{
                        title: 'Explore',
                        tabBarIcon: ({ color }) => (
                            <Feather name="search" size={28} color={color} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="create"
                    options={{
                        title: 'Create',
                        tabBarIcon: ({ color }) => (
                            <View style={[styles.createButton, { backgroundColor: colors.primary }]}>
                                <Feather name="plus" size={28} color={colors.primaryForeground} />
                            </View>
                        ),
                    }}
                />
                <Tabs.Screen
                    name="messages"
                    options={{
                        title: 'Messages',
                        // Capped the same way the bell is, so a long-neglected
                        // inbox cannot widen the tab and shove the icons along.
                        tabBarBadge: messagesUnread > 0 ? (messagesUnread > 9 ? '9+' : messagesUnread) : undefined,
                        tabBarBadgeStyle: styles.tabBadge,
                        tabBarIcon: ({ color }) => (
                            <Feather name="message-circle" size={28} color={color} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="profile"
                    options={{
                        title: 'Profile',
                        tabBarIcon: ({ color }) => (
                            <Feather name="user" size={28} color={color} />
                        ),
                    }}
                />
            </Tabs>

            {/* Settings Drawer */}
            <SettingsDrawer
                visible={showSettings}
                onClose={() => setShowSettings(false)}
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
    headerButton: {
        position: 'relative',
        padding: 4,
    },
    logo: {
        fontSize: 28,
        fontFamily: 'Inter_900Black',
        letterSpacing: -1.5,
        textShadowColor: 'rgba(0, 0, 0, 0.25)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    // The tab bar draws and positions its own badge, so this only has to agree
    // with the bell's on colour and weight -- the same red, so two unread
    // counts on one screen do not look like two different kinds of alert.
    tabBadge: {
        backgroundColor: '#ff3b5c',
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
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
    createButton: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 0,
        boxShadow: '0px 4px 4.65px rgba(0, 0, 0, 0.3)',
        elevation: 8,
    },
});
