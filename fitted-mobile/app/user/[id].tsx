import { StyleSheet, FlatList, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { Text, View } from '@/components/Themed';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import { User, Post } from '@/types';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 4) / 3;

export default function UserProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [user, setUser] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ followers: 0, following: 0 });
    const [isFollowing, setIsFollowing] = useState(false);

    const currentUser = useAuthStore((state) => state.user);
    const createConversation = useMessagesStore((state) => state.createConversation);
    const fetchConversations = useMessagesStore((state) => state.fetchConversations);

    const isOwnProfile = currentUser?.id === id;

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

    const handleMessage = async () => {
        if (!currentUser || !id) return;

        const conversationId = await createConversation(currentUser.id, id);
        if (conversationId) {
            await fetchConversations(currentUser.id);
            // Find and set the active conversation
            const conversations = useMessagesStore.getState().conversations;
            const convo = conversations.find(c => c.id === conversationId);
            if (convo) {
                useMessagesStore.getState().setActiveConversation(convo);
            }
            router.push('/(tabs)/messages');
        }
    };

    const renderPostThumbnail = ({ item }: { item: Post }) => (
        <Pressable style={styles.gridItem}>
            <Image
                source={{ uri: item.generated_image }}
                style={styles.gridImage}
                contentFit="cover"
            />
        </Pressable>
    );

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="large" />
                </View>
            </View>
        );
    }

    if (!user) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backButton}>
                        <Feather name="arrow-left" size={24} color="#fff" />
                    </Pressable>
                    <Text style={styles.headerTitle}>User not found</Text>
                    <View style={{ width: 40 }} />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color="#fff" />
                </Pressable>
                <Text style={styles.headerTitle}>{user.username}</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={posts}
                keyExtractor={(item) => item.id}
                numColumns={3}
                renderItem={renderPostThumbnail}
                ListHeaderComponent={
                    <View style={styles.profileSection}>
                        {/* Avatar */}
                        <View style={styles.avatarContainer}>
                            {user.avatar_url ? (
                                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Feather name="user" size={40} color="#666" />
                                </View>
                            )}
                        </View>

                        {/* Username & Bio */}
                        <Text style={styles.username}>{user.username}</Text>
                        <Text style={styles.handle}>{user.handle}</Text>
                        {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

                        {/* Stats */}
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statNumber}>{posts.length}</Text>
                                <Text style={styles.statLabel}>Fits</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statNumber}>{stats.followers}</Text>
                                <Text style={styles.statLabel}>Followers</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statNumber}>{stats.following}</Text>
                                <Text style={styles.statLabel}>Following</Text>
                            </View>
                        </View>

                        {/* Action Buttons */}
                        {!isOwnProfile && (
                            <View style={styles.actionButtons}>
                                <Pressable
                                    style={[styles.followButton, isFollowing && styles.followingButton]}
                                    onPress={handleFollow}
                                >
                                    <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                                        {isFollowing ? 'Following' : 'Follow'}
                                    </Text>
                                </Pressable>
                                <Pressable style={styles.messageButton} onPress={handleMessage}>
                                    <Feather name="message-circle" size={20} color="#fff" />
                                </Pressable>
                            </View>
                        )}

                        {/* Posts Header */}
                        <View style={styles.postsHeader}>
                            <Feather name="grid" size={20} color="#fff" />
                        </View>
                    </View>
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No posts yet</Text>
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
    backButton: {
        width: 40,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    profileSection: {
        alignItems: 'center',
        padding: 24,
        backgroundColor: 'transparent',
    },
    avatarContainer: {
        marginBottom: 16,
        backgroundColor: 'transparent',
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    username: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
    },
    handle: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
    },
    bio: {
        fontSize: 14,
        color: '#ccc',
        textAlign: 'center',
        marginTop: 12,
        paddingHorizontal: 20,
    },
    statsRow: {
        flexDirection: 'row',
        marginTop: 24,
        gap: 32,
        backgroundColor: 'transparent',
    },
    statItem: {
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    statNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    statLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    actionButtons: {
        flexDirection: 'row',
        marginTop: 24,
        gap: 12,
        backgroundColor: 'transparent',
    },
    followButton: {
        backgroundColor: '#fff',
        paddingVertical: 10,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    followingButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#444',
    },
    followButtonText: {
        color: '#000',
        fontWeight: '600',
        fontSize: 14,
    },
    followingButtonText: {
        color: '#fff',
    },
    messageButton: {
        backgroundColor: '#222',
        padding: 10,
        borderRadius: 8,
    },
    postsHeader: {
        marginTop: 24,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#fff',
        backgroundColor: 'transparent',
    },
    gridItem: {
        width: GRID_SIZE,
        height: GRID_SIZE,
        margin: 0.5,
    },
    gridImage: {
        width: '100%',
        height: '100%',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
        backgroundColor: 'transparent',
    },
    emptyText: {
        color: '#666',
        fontSize: 14,
    },
});
