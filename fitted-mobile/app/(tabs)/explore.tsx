import { StyleSheet, TextInput, FlatList, Pressable, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { supabase } from '@/services/supabase';
import { useMessagesStore } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';
import { Post, User } from '@/types';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 4) / 3;

export default function ExploreScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [discoverPosts, setDiscoverPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);

    const createConversation = useMessagesStore((state) => state.createConversation);
    const fetchConversations = useMessagesStore((state) => state.fetchConversations);
    const user = useAuthStore((state) => state.user);

    // Fetch discover posts on focus
    useFocusEffect(
        useCallback(() => {
            fetchDiscoverPosts();
        }, [])
    );

    const fetchDiscoverPosts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('posts')
            .select('*')
            .order('likes_count', { ascending: false })
            .limit(30);

        if (!error && data) {
            setDiscoverPosts(data);
        }
        setLoading(false);
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);

        if (query.trim().length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }

        setSearching(true);
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .or(`username.ilike.%${query}%,handle.ilike.%${query}%`)
            .limit(10);

        if (!error && data) {
            setSearchResults(data);
        }
        setSearching(false);
    };

    const handleMessageUser = async (otherUser: User) => {
        if (!user) return;

        // Create or get existing conversation
        const conversationId = await createConversation(user.id, otherUser.id);
        if (conversationId) {
            // Refresh conversations 
            await fetchConversations(user.id);
            // Find and set the active conversation
            const conversations = useMessagesStore.getState().conversations;
            const convo = conversations.find(c => c.id === conversationId);
            if (convo) {
                useMessagesStore.getState().setActiveConversation(convo);
            }
            router.push('/(tabs)/messages');
        }
    };

    const handleUserPress = (userId: string) => {
        router.push({ pathname: '/(tabs)/user/[id]', params: { id: userId } });
    };

    const renderUserResult = ({ item }: { item: User }) => (
        <Pressable style={styles.userItem} onPress={() => handleUserPress(item.id)}>
            <View style={styles.userAvatar}>
                {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Feather name="user" size={20} color="#666" />
                    </View>
                )}
            </View>
            <View style={styles.userInfo}>
                <Text style={styles.username}>{item.username}</Text>
                <Text style={styles.handle}>{item.handle}</Text>
            </View>
            <Pressable style={styles.messageButton} onPress={(e) => { e.stopPropagation(); handleMessageUser(item); }}>
                <Feather name="message-circle" size={20} color="#fff" />
            </Pressable>
        </Pressable>
    );

    const renderPostThumbnail = ({ item }: { item: Post }) => (
        <Pressable style={styles.gridItem}>
            <Image
                source={{ uri: item.generated_image }}
                style={styles.gridImage}
                contentFit="cover"
            />
            {item.likes_count > 0 && (
                <View style={styles.likesOverlay}>
                    <Feather name="heart" size={12} color="#fff" />
                    <Text style={styles.likesText}>{item.likes_count}</Text>
                </View>
            )}
        </Pressable>
    );

    const showSearchResults = searchQuery.trim().length >= 2;

    return (
        <View style={styles.container}>
            {/* Search Bar */}
            <View style={styles.header}>
                <View style={styles.searchBar}>
                    <Feather name="search" size={18} color="#666" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search users..."
                        placeholderTextColor="#666"
                        value={searchQuery}
                        onChangeText={handleSearch}
                        autoCapitalize="none"
                    />
                    {searchQuery.length > 0 && (
                        <Pressable onPress={() => handleSearch('')}>
                            <Feather name="x" size={18} color="#666" />
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Content */}
            {showSearchResults ? (
                /* Search Results */
                searching ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator color="#fff" />
                    </View>
                ) : searchResults.length > 0 ? (
                    <FlatList
                        key="search-list"
                        data={searchResults}
                        keyExtractor={(item) => item.id}
                        renderItem={renderUserResult}
                        style={styles.searchList}
                    />
                ) : (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No users found</Text>
                    </View>
                )
            ) : (
                /* Discover Grid */
                loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator color="#fff" size="large" />
                    </View>
                ) : (
                    <FlatList
                        key="discover-grid"
                        data={discoverPosts}
                        keyExtractor={(item) => item.id}
                        numColumns={3}
                        renderItem={renderPostThumbnail}
                        ListHeaderComponent={
                            <Text style={styles.sectionTitle}>Discover</Text>
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Feather name="compass" size={48} color="#333" />
                                <Text style={styles.emptyText}>Nothing to explore yet</Text>
                                <Text style={styles.emptySubtext}>Posts will appear here</Text>
                            </View>
                        }
                        showsVerticalScrollIndicator={false}
                    />
                )
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#000',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
        color: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    searchList: {
        flex: 1,
        paddingHorizontal: 16,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: '#222',
        backgroundColor: 'transparent',
    },
    userAvatar: {
        marginRight: 12,
        backgroundColor: 'transparent',
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
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    messageButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
    },
    username: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    handle: {
        fontSize: 14,
        color: '#888',
        marginTop: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    gridItem: {
        width: GRID_SIZE,
        height: GRID_SIZE,
        margin: 0.5,
        position: 'relative',
    },
    gridImage: {
        width: '100%',
        height: '100%',
    },
    likesOverlay: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    likesText: {
        fontSize: 12,
        color: '#fff',
        marginLeft: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 100,
        backgroundColor: 'transparent',
    },
    emptyText: {
        fontSize: 16,
        color: '#fff',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
});
