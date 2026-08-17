import { StyleSheet, ActivityIndicator, View, Text, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';

import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import { User, Post } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import ProfileView from '@/components/ProfileView';
import { reportContent, blockUser } from '@/services/moderation';

export default function UserProfileScreen() {
    const { colors } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [user, setUser] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ followers: 0, following: 0, fits: 0 });
    const [isFollowing, setIsFollowing] = useState(false);

    const currentUser = useAuthStore((state) => state.user);
    const createConversation = useMessagesStore((state) => state.createConversation);
    const fetchConversations = useMessagesStore((state) => state.fetchConversations);

    const isOwnProfile = currentUser?.id === id;

    // Redirect to own profile tab if viewing own profile
    useEffect(() => {
        if (isOwnProfile && !loading) {
            router.replace('/(tabs)/profile');
        }
    }, [isOwnProfile, loading]);

    useEffect(() => {
        if (id) {
            fetchUserData();
        }
    }, [id]);

    const fetchUserData = async () => {
        setLoading(true);
        try {
            // Fetch user
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', id)
                .single();

            if (!userError && userData) {
                setUser(userData);
            }

            // Fetch posts
            const { data: postsData } = await supabase
                .from('posts')
                .select('*')
                .eq('user_id', id)
                .order('created_at', { ascending: false });

            if (postsData) {
                setPosts(postsData);
            }

            // Fetch follower/following counts
            const { count: followersCount } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('following_id', id);

            const { count: followingCount } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('follower_id', id);

            setStats({
                followers: followersCount || 0,
                following: followingCount || 0,
                fits: postsData?.length || 0,
            });

            // Check if current user follows this user
            if (currentUser && currentUser.id !== id) {
                const { data: followData } = await supabase
                    .from('follows')
                    .select('*')
                    .eq('follower_id', currentUser.id)
                    .eq('following_id', id)
                    .single();

                setIsFollowing(!!followData);
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchUserData();
        setRefreshing(false);
    };

    const handleFollow = async () => {
        if (!currentUser || !id) return;

        const wasFollowing = isFollowing;
        setIsFollowing(!wasFollowing);
        setStats(prev => ({
            ...prev,
            followers: prev.followers + (wasFollowing ? -1 : 1),
        }));

        try {
            if (wasFollowing) {
                await supabase
                    .from('follows')
                    .delete()
                    .eq('follower_id', currentUser.id)
                    .eq('following_id', id);
            } else {
                await supabase
                    .from('follows')
                    .insert({ follower_id: currentUser.id, following_id: id });

                // Create follow notification
                await supabase.from('notifications').insert({
                    user_id: id,
                    actor_id: currentUser.id,
                    type: 'follow',
                });
            }
        } catch (error) {
            // Revert on error
            setIsFollowing(wasFollowing);
            setStats(prev => ({
                ...prev,
                followers: prev.followers + (wasFollowing ? 1 : -1),
            }));
        }
    };

    const handleModerate = () => {
        if (!id) return;
        const name = user?.username || 'this user';
        Alert.alert(name, 'Manage this user', [
            {
                text: 'Report User',
                onPress: () => {
                    Alert.alert('Report User', `Report ${name} for objectionable content or behavior?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Report',
                            style: 'destructive',
                            onPress: async () => {
                                const { error } = await reportContent({ contentType: 'user', reportedUserId: id });
                                Alert.alert(error ? 'Error' : 'Reported', error || 'Thanks. Our team will review this account.');
                            },
                        },
                    ]);
                },
            },
            {
                text: 'Block User',
                style: 'destructive',
                onPress: () => {
                    Alert.alert('Block User', `Block ${name}? You won't see their posts, and they won't be able to interact with you.`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Block',
                            style: 'destructive',
                            onPress: async () => {
                                const { error } = await blockUser(id);
                                if (error) { Alert.alert('Error', error); return; }
                                router.back();
                            },
                        },
                    ]);
                },
            },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const handleMessage = async () => {
        if (!currentUser || !id) return;

        const conversationId = await createConversation(currentUser.id, id);
        if (conversationId) {
            await fetchConversations(currentUser.id);
            const conversations = useMessagesStore.getState().conversations;
            const convo = conversations.find(c => c.id === conversationId);
            if (convo) {
                useMessagesStore.getState().setActiveConversation(convo);
            }
            router.push('/(tabs)/messages');
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.text} size="large" />
                </View>
            </View>
        );
    }

    if (!user) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.loadingContainer}>
                    <Text style={{ color: colors.text }}>User not found</Text>
                </View>
            </View>
        );
    }

    // Show loading while redirecting to own profile
    if (isOwnProfile) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.text} size="large" />
                </View>
            </View>
        );
    }

    return (
        <ProfileView
            user={user}
            posts={posts}
            isOwnProfile={false}
            isFollowing={isFollowing}
            onFollow={handleFollow}
            onMessage={handleMessage}
            onModerate={handleModerate}
            onRefresh={onRefresh}
            refreshing={refreshing}
            stats={stats}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
