import { StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { Text, View } from '@/components/Themed';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/hooks/useTheme';
import UserBadges from '@/components/UserBadges';

interface ConnectionUser {
    id: string;
    username: string;
    handle?: string;
    avatar_url?: string;
    is_verified_stylist?: boolean | null;
    is_business_account?: boolean | null;
    is_verified_boutique?: boolean | null;
}

export default function ConnectionsScreen() {
    const { colors } = useTheme();
    const params = useLocalSearchParams();
    const userId = params.userId as string;
    const type = (params.type as 'followers' | 'following') || 'followers';
    const username = params.username as string;

    const [users, setUsers] = useState<ConnectionUser[]>([]);
    const [loading, setLoading] = useState(true);

    const loadConnections = useCallback(async () => {
        if (!userId) return;
        setLoading(true);

        // Followers = people who follow this user (their follower_id).
        // Following = people this user follows (their following_id).
        const matchColumn = type === 'followers' ? 'following_id' : 'follower_id';
        const selectColumn = type === 'followers' ? 'follower_id' : 'following_id';

        const { data: followRows, error } = await supabase
            .from('follows')
            .select(selectColumn)
            .eq(matchColumn, userId);

        if (error || !followRows || followRows.length === 0) {
            setUsers([]);
            setLoading(false);
            return;
        }

        const ids = followRows.map((row: any) => row[selectColumn]);

        const { data: userRows } = await supabase
            .from('users')
            .select('id, username, handle, avatar_url, is_verified_stylist, is_business_account, is_verified_boutique')
            .in('id', ids);

        setUsers((userRows as ConnectionUser[]) || []);
        setLoading(false);
    }, [userId, type]);

    useEffect(() => {
        loadConnections();
    }, [loadConnections]);

    const handleUserPress = (id: string) => {
        router.push({ pathname: '/user/[id]', params: { id } });
    };

    const renderUser = ({ item }: { item: ConnectionUser }) => (
        <Pressable
            style={[styles.userItem, { borderBottomColor: colors.border }]}
            onPress={() => handleUserPress(item.id)}
        >
            {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                    <Feather name="user" size={20} color={colors.textSecondary} />
                </View>
            )}
            <View style={styles.userInfo}>
                <View style={styles.usernameRow}>
                    <Text style={[styles.username, { color: colors.text }]}>{item.username}</Text>
                    <UserBadges user={item} size={14} />
                </View>
                {item.handle ? (
                    <Text style={[styles.handle, { color: colors.textSecondary }]}>{item.handle}</Text>
                ) : null}
            </View>
            <Feather name="chevron-right" size={20} color={colors.textTertiary} />
        </Pressable>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
                    <Feather name="chevron-left" size={26} color={colors.text} />
                </Pressable>
                <View style={styles.headerTitleWrap}>
                    <Text style={[styles.title, { color: colors.text }]}>
                        {type === 'followers' ? 'Followers' : 'Following'}
                    </Text>
                    {username ? (
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                            {username}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.backButton} />
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={colors.text} size="large" />
                </View>
            ) : (
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.id}
                    renderItem={renderUser}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Feather name="users" size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>
                                {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                            </Text>
                        </View>
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 8,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
    },
    backButton: {
        width: 40,
        alignItems: 'center',
    },
    headerTitleWrap: {
        flex: 1,
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    subtitle: {
        fontSize: 13,
        marginTop: 2,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 0.5,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    avatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
        marginLeft: 12,
    },
    usernameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    username: {
        fontSize: 15,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    handle: {
        fontSize: 13,
        marginTop: 2,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 16,
        textAlign: 'center',
    },
});
