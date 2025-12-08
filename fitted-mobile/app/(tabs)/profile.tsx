import { StyleSheet, Pressable, Image, FlatList, Dimensions, ActivityIndicator, RefreshControl } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/stores/authStore';
import { usePostsStore } from '@/stores/postsStore';
import { supabase } from '@/services/supabase';
import { Post } from '@/types';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 4) / 3;

export default function ProfileScreen() {
    const user = useAuthStore((state) => state.user);
    const session = useAuthStore((state) => state.session);
    const signOut = useAuthStore((state) => state.signOut);
    const setUser = useAuthStore((state) => state.setUser);
    const fetchUserPosts = usePostsStore((state) => state.fetchUserPosts);
    const fetchSavedPosts = usePostsStore((state) => state.fetchSavedPosts);

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [userPosts, setUserPosts] = useState<Post[]>([]);
    const [savedPosts, setSavedPosts] = useState<Post[]>([]);
    const [activeTab, setActiveTab] = useState<'posts' | 'saved'>('posts');
    const [stats, setStats] = useState({ followers: 0, following: 0, fits: 0 });

    // Fetch profile if user is null but session exists
    useEffect(() => {
        const fetchProfile = async () => {
            if (!user && session?.user) {
                setLoading(true);
                const { data } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (data) {
                    setUser(data);
                }
                setLoading(false);
            }
        };
        fetchProfile();
    }, [user, session]);

    // Fetch user's posts when tab comes into focus
    useFocusEffect(
        useCallback(() => {
            loadProfileData();
        }, [user])
    );

    const loadProfileData = async () => {
        if (!user?.id) return;

        // Refetch user profile from database
        const { data: freshUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (freshUser) {
            setUser(freshUser);
        }

        const posts = await fetchUserPosts(user.id);
        setUserPosts(posts);

        const saved = await fetchSavedPosts(user.id);
        setSavedPosts(saved);

        // Get follower/following counts
        const [{ count: followers }, { count: following }] = await Promise.all([
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
        ]);

        setStats({
            followers: followers || 0,
            following: following || 0,
            fits: posts.length,
        });
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadProfileData();
        setRefreshing(false);
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="large" />
                </View>
            </View>
        );
    }

    const renderPostThumbnail = ({ item }: { item: Post }) => (
        <Pressable style={styles.gridItem}>
            <ExpoImage
                source={{ uri: item.generated_image }}
                style={styles.gridImage}
                contentFit="cover"
            />
        </Pressable>
    );

    const displayPosts = activeTab === 'posts' ? userPosts : savedPosts;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.handle}>{user?.handle || '@user'}</Text>
                <Pressable onPress={signOut}>
                    <Feather name="log-out" size={22} color="#fff" />
                </Pressable>
            </View>

            <FlatList
                data={displayPosts}
                keyExtractor={(item) => item.id}
                numColumns={3}
                renderItem={renderPostThumbnail}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#fff"
                    />
                }
                ListHeaderComponent={
                    <View style={styles.profileSection}>
                        <View style={styles.avatarContainer}>
                            {user?.avatar_url ? (
                                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Feather name="user" size={40} color="#666" />
                                </View>
                            )}
                        </View>

                        <Text style={styles.username}>{user?.username || 'User'}</Text>
                        <Text style={styles.bio}>{user?.bio || 'No bio yet'}</Text>

                        <View style={styles.statsRow}>
                            <View style={styles.stat}>
                                <Text style={styles.statNumber}>{stats.fits}</Text>
                                <Text style={styles.statLabel}>Fits</Text>
                            </View>
                            <View style={styles.stat}>
                                <Text style={styles.statNumber}>{stats.followers}</Text>
                                <Text style={styles.statLabel}>Followers</Text>
                            </View>
                            <View style={styles.stat}>
                                <Text style={styles.statNumber}>{stats.following}</Text>
                                <Text style={styles.statLabel}>Following</Text>
                            </View>
                        </View>

                        <Pressable style={styles.editButton} onPress={() => router.push('/edit-profile')}>
                            <Text style={styles.editButtonText}>Edit Profile</Text>
                        </Pressable>

                        {/* Tab Buttons */}
                        <View style={styles.tabsRow}>
                            <Pressable
                                style={[styles.tabButton, activeTab === 'posts' && styles.tabButtonActive]}
                                onPress={() => setActiveTab('posts')}
                            >
                                <Feather name="grid" size={22} color={activeTab === 'posts' ? '#fff' : '#666'} />
                            </Pressable>
                            <Pressable
                                style={[styles.tabButton, activeTab === 'saved' && styles.tabButtonActive]}
                                onPress={() => setActiveTab('saved')}
                            >
                                <Feather name="bookmark" size={22} color={activeTab === 'saved' ? '#fff' : '#666'} />
                            </Pressable>
                        </View>
                    </View>
                }
                ListEmptyComponent={
                    <View style={styles.emptyGrid}>
                        <Feather name={activeTab === 'posts' ? 'camera' : 'bookmark'} size={48} color="#333" />
                        <Text style={styles.emptyText}>{activeTab === 'posts' ? 'No fits yet' : 'No saved posts'}</Text>
                        <Text style={styles.emptySubtext}>
                            {activeTab === 'posts' ? 'Create your first fit!' : 'Save posts to see them here'}
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#000',
    },
    handle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
    },
    profileSection: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 0,
        backgroundColor: 'transparent',
    },
    avatarContainer: {
        marginBottom: 12,
        backgroundColor: 'transparent',
    },
    avatar: {
        width: 90,
        height: 90,
        borderRadius: 45,
    },
    avatarPlaceholder: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    username: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    bio: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
        textAlign: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        marginTop: 20,
        marginBottom: 16,
        backgroundColor: 'transparent',
    },
    stat: {
        alignItems: 'center',
        marginHorizontal: 24,
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
    editButton: {
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 24,
    },
    editButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
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
    emptyGrid: {
        alignItems: 'center',
        paddingVertical: 60,
        backgroundColor: 'transparent',
    },
    emptyText: {
        color: '#fff',
        fontSize: 16,
        marginTop: 16,
    },
    emptySubtext: {
        color: '#666',
        fontSize: 14,
        marginTop: 4,
    },
    tabsRow: {
        flexDirection: 'row',
        marginTop: 16,
        marginBottom: 4,
        borderTopWidth: 0.5,
        borderTopColor: '#222',
        backgroundColor: 'transparent',
    },
    tabButton: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
    },
    tabButtonActive: {
        borderTopWidth: 2,
        borderTopColor: '#fff',
    },
});
