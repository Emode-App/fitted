import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
    Dimensions,
    Modal,
    Linking,
    Alert,
    Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';

import PostItem from '@/components/PostItem';
import CommentsModal from '@/components/CommentsModal';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/services/supabase';
import { searchProducts } from '@/services/aiService';
import { Post, ClothingItem } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { usePostsStore } from '@/stores/postsStore';

const { width } = Dimensions.get('window');

export default function PostDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);
    const deletePost = usePostsStore((state) => state.deletePost);
    const toggleLike = usePostsStore((state) => state.toggleLike);
    const toggleSave = usePostsStore((state) => state.toggleSave);
    const setCurrentUserId = usePostsStore((state) => state.setCurrentUserId);

    const [post, setPost] = useState<Post | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // "More from" brand collections
    const [brandCollections, setBrandCollections] = useState<Record<string, ClothingItem[]>>({});
    const [loadingBrands, setLoadingBrands] = useState<string[]>([]);

    const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null);
    const [showComments, setShowComments] = useState(false);

    useEffect(() => {
        if (user?.id) {
            setCurrentUserId(user.id);
        }
    }, [user?.id]);

    useEffect(() => {
        fetchPost();
    }, [id, user?.id]); // Re-fetch when user loads to verify 'is_liked' status

    useEffect(() => {
        if (post?.items) {
            fetchBrandCollections();
        }
    }, [post]);

    const fetchPost = async () => {
        if (!id) return;
        const postId = Array.isArray(id) ? id[0] : id;

        try {
            setLoading(true);
            setError(null);

            // Fetch post with user info
            const { data, error: fetchError } = await supabase
                .from('posts')
                .select(`
                    *,
                    user:users!posts_user_id_fkey(*)
                `)
                .eq('id', postId)
                .single();

            if (fetchError) throw fetchError;

            // Count actual likes from likes table
            const { count: likesCount } = await supabase
                .from('likes')
                .select('*', { count: 'exact', head: true })
                .eq('post_id', postId);

            // Check if current user liked this post
            let isLiked = false;
            let isSaved = false;

            if (user?.id) {
                // Check like status using count/head for efficiency and reliability
                const { count: userLikeCount } = await supabase
                    .from('likes')
                    .select('*', { count: 'exact', head: true })
                    .eq('post_id', postId)
                    .eq('user_id', user.id);

                isLiked = (userLikeCount || 0) > 0;

                const { count: userSaveCount } = await supabase
                    .from('saved_posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('post_id', postId)
                    .eq('user_id', user.id);

                isSaved = (userSaveCount || 0) > 0;
            }

            setPost({
                ...data,
                likes_count: likesCount || 0,
                is_liked: isLiked,
                is_saved: isSaved,
            });
        } catch (err: any) {
            console.error('Error fetching post:', err);
            setError(err.message || 'Failed to load post');
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!post) return;
        try {
            await Share.share({
                message: `Check out this fit by ${post.user?.username || 'user'}: ${post.caption || ''}`,
                url: `fitted://post/${post.id}`, // Deep link if applicable
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const handleLike = async () => {
        if (!post || !user?.id) return;

        // Optimistic update
        const wasLiked = post.is_liked;
        setPost(prev => prev ? {
            ...prev,
            is_liked: !wasLiked,
            likes_count: Math.max(0, (prev.likes_count || 0) + (wasLiked ? -1 : 1))
        } : null);

        try {
            if (wasLiked) {
                await supabase
                    .from('likes')
                    .delete()
                    .eq('post_id', post.id)
                    .eq('user_id', user.id);

                // Remove notification if unliking
                if (post.user_id && post.user_id !== user.id) {
                    await supabase
                        .from('notifications')
                        .delete()
                        .eq('user_id', post.user_id)
                        .eq('actor_id', user.id)
                        .eq('type', 'like')
                        .eq('post_id', post.id);
                }
            } else {
                await supabase
                    .from('likes')
                    .insert({ post_id: post.id, user_id: user.id });


                // Create notification for post owner
                if (post.user_id && post.user_id !== user.id) {
                    try {
                        const { data: existingNotif } = await supabase
                            .from('notifications')
                            .select('id')
                            .eq('user_id', post.user_id)
                            .eq('actor_id', user.id)
                            .eq('type', 'like')
                            .eq('post_id', post.id)
                            .maybeSingle();

                        if (existingNotif) {
                            const { error: updateError } = await supabase
                                .from('notifications')
                                .update({
                                    is_read: false,
                                    created_at: new Date().toISOString()
                                })
                                .eq('id', existingNotif.id);
                            if (updateError) console.error('Notification update error:', updateError);
                        } else {
                            const { error: insertError } = await supabase.from('notifications').insert({
                                user_id: post.user_id,
                                actor_id: user.id,
                                type: 'like',
                                post_id: post.id,
                                is_read: false,
                                created_at: new Date().toISOString(),
                            });
                            if (insertError) console.error('Notification insert error:', insertError);
                        }
                    } catch (innerError) {
                        console.error('Notification creation exception:', innerError);
                    }
                }
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            // Revert on error
            setPost(prev => prev ? {
                ...prev,
                is_liked: wasLiked,
                likes_count: Math.max(0, (prev.likes_count || 0) + (wasLiked ? 1 : -1))
            } : null);
        }
    };


    const handleSave = async () => {
        if (!post || !user?.id) return;

        const wasSaved = post.is_saved;
        setPost(prev => prev ? { ...prev, is_saved: !wasSaved } : null);

        try {
            if (wasSaved) {
                await supabase
                    .from('saved_posts')
                    .delete()
                    .eq('post_id', post.id)
                    .eq('user_id', user.id);
            } else {
                await supabase
                    .from('saved_posts')
                    .insert({ post_id: post.id, user_id: user.id });
            }
        } catch (error) {
            console.error('Error toggling save:', error);
            setPost(prev => prev ? { ...prev, is_saved: wasSaved } : null);
        }
    };

    const fetchBrandCollections = async () => {
        if (!post?.items) return;

        // Get unique brands from post items, excluding 'unknown' and items without purchase links
        const brands = [...new Set(
            post.items
                .filter(item => item.brand && item.brand.toLowerCase() !== 'unknown' && item.purchase_link)
                .map(item => item.brand)
        )];

        for (const brand of brands) {
            if (brandCollections[brand]) continue; // Already loaded

            setLoadingBrands(prev => [...prev, brand]);

            try {
                const results = await searchProducts(`${brand} clothing`);

                if (results && results.length > 0) {
                    const mappedItems: ClothingItem[] = results.slice(0, 8).map((item: any, index: number) => {
                        // Image fallback logic
                        let imageUrl = item.imageUrl;
                        if (!imageUrl || imageUrl.length < 10) {
                            const searchTerm = `${item.brand} ${item.name} white background`;
                            imageUrl = `https://tse2.mm.bing.net/th?q=${encodeURIComponent(searchTerm)}&w=500&h=500&c=7&rs=1&p=0`;
                        }

                        return {
                            id: `dyn_${brand}_${index}`,
                            brand: item.brand || brand,
                            name: item.name,
                            price: item.price || 0,
                            image_url: imageUrl,
                            purchase_link: item.purchaseLink || '',
                        };
                    });

                    setBrandCollections(prev => ({ ...prev, [brand]: mappedItems }));
                }
            } catch (err) {
                console.error(`Failed to fetch items for ${brand}:`, err);
            } finally {
                setLoadingBrands(prev => prev.filter(b => b !== brand));
            }
        }
    };

    const handleOpenLink = async (link: string) => {
        if (link) {
            try {
                const canOpen = await Linking.canOpenURL(link);
                if (canOpen) {
                    await Linking.openURL(link);
                } else {
                    Alert.alert('Cannot Open Link', 'Unable to open this URL on your device.');
                }
            } catch (error) {
                console.error('Error opening link:', error);
                Alert.alert('Error', 'Failed to open the link.');
            }
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (error || !post) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <Feather name="alert-circle" size={48} color={colors.textTertiary} />
                <Text style={[styles.errorText, { color: colors.textTertiary }]}>
                    {error || 'Post not found'}
                </Text>
                <Pressable style={[styles.backButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>Go Back</Text>
                </Pressable>
            </View>
        );
    }

    const brands = [...new Set(post.items?.map(item => item.brand).filter(b => b && b.toLowerCase() !== 'unknown') || [])];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Pressable style={styles.backTouchable} onPress={() => router.back()}>
                    <Feather name="chevron-left" size={28} color={colors.text} />
                </Pressable>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Post</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Post Content */}
                <PostItem
                    post={post}
                    onLike={handleLike}
                    onComment={() => setShowComments(true)}
                    onShare={handleShare}
                    onSave={handleSave}
                    onUserPress={() => router.push(`/user/${post.user_id}`)}
                    onDelete={async () => {
                        await deletePost(post.id);
                        router.back();
                    }}
                    currentUserId={user?.id}
                />

                {/* More from Brand Sections */}
                <View style={styles.moreFromContainer}>
                    {brands.map(brand => {
                        const collection = brandCollections[brand] || [];
                        const isLoading = loadingBrands.includes(brand);

                        return (
                            <View key={brand} style={styles.brandSection}>
                                <View style={[styles.brandHeader, { borderBottomColor: colors.border }]}>
                                    <Text style={[styles.moreFromText, { color: colors.textSecondary }]}>
                                        More from
                                    </Text>
                                    <Pressable onPress={() => router.push({ pathname: '/brand/[id]', params: { id: brand } })}>
                                        <Text style={[styles.brandName, { color: colors.text }]}>
                                            {brand}
                                        </Text>
                                    </Pressable>
                                </View>

                                {isLoading ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator size="small" color={colors.primary} />
                                    </View>
                                ) : collection.length > 0 ? (
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.itemsScroll}
                                    >
                                        {collection.map((item, idx) => (
                                            <Pressable
                                                key={item.id + idx}
                                                style={styles.itemCard}
                                                onPress={() => setSelectedItem(item)}
                                            >
                                                <View style={[styles.itemImageContainer, { backgroundColor: colors.backgroundSecondary }]}>
                                                    <ExpoImage
                                                        source={{ uri: item.image_url }}
                                                        style={styles.itemImage}
                                                        contentFit="cover"
                                                    />
                                                </View>
                                                <Text style={[styles.itemBrand, { color: colors.textTertiary }]} numberOfLines={1}>
                                                    {item.brand}
                                                </Text>
                                                <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
                                                    {item.name}
                                                </Text>
                                                <Text style={[styles.itemPrice, { color: colors.text }]}>
                                                    ${item.price}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                ) : (
                                    <Text style={[styles.noItemsText, { color: colors.textTertiary }]}>
                                        No items found
                                    </Text>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* Bottom padding */}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Shop Modal */}
            <Modal
                visible={!!selectedItem}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedItem(null)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setSelectedItem(null)}>
                    <Pressable
                        style={[styles.modalContent, { backgroundColor: colors.background }]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        {selectedItem && (
                            <>
                                <ExpoImage
                                    source={{ uri: selectedItem.image_url }}
                                    style={styles.modalImage}
                                    contentFit="contain"
                                />
                                <Text style={[styles.modalBrand, { color: colors.textSecondary }]}>
                                    {selectedItem.brand}
                                </Text>
                                <Text style={[styles.modalPrice, { color: colors.primary }]}>
                                    ${selectedItem.price}
                                </Text>

                                <Pressable
                                    style={[styles.shopButton, { backgroundColor: colors.primary }]}
                                    onPress={() => handleOpenLink(selectedItem.purchase_link)}
                                >
                                    <Feather name="external-link" size={18} color="#fff" />
                                    <Text style={styles.shopButtonText}>View on StockX</Text>
                                </Pressable>

                                <Pressable style={styles.closeButton} onPress={() => setSelectedItem(null)}>
                                    <Text style={[styles.closeButtonText, { color: colors.textTertiary }]}>
                                        Close
                                    </Text>
                                </Pressable>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Comments Modal */}
            {post && (
                <CommentsModal
                    visible={showComments}
                    onClose={() => setShowComments(false)}
                    postId={post.id}
                    postOwnerId={post.user_id}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingTop: 50,
        paddingBottom: 12,
        borderBottomWidth: 1,
    },
    backTouchable: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
    headerSpacer: {
        width: 36,
    },
    errorText: {
        fontSize: 16,
        marginTop: 16,
        marginBottom: 24,
    },
    backButton: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
    },
    backButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
    moreFromContainer: {
        paddingHorizontal: 16,
        marginTop: 8,
    },
    brandSection: {
        marginBottom: 24,
    },
    brandHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        paddingBottom: 8,
        marginBottom: 12,
        borderBottomWidth: 1,
    },
    moreFromText: {
        fontSize: 18,
    },
    brandName: {
        fontSize: 18,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
    loadingContainer: {
        height: 150,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemsScroll: {
        paddingRight: 16,
    },
    itemCard: {
        width: 140,
        marginRight: 12,
    },
    itemImageContainer: {
        width: 140,
        height: 140,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 8,
    },
    itemImage: {
        width: '100%',
        height: '100%',
    },
    itemBrand: {
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    itemName: {
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 4,
    },
    itemPrice: {
        fontSize: 14,
        fontWeight: '700',
    },
    noItemsText: {
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 20,
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        alignItems: 'center',
    },
    modalImage: {
        width: 150,
        height: 150,
        borderRadius: 12,
        marginBottom: 16,
    },
    modalBrand: {
        fontSize: 14,
        fontWeight: '500',
        textTransform: 'uppercase',
    },
    modalName: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 4,
        textAlign: 'center',
    },
    modalPrice: {
        fontSize: 22,
        fontWeight: '700',
        marginTop: 8,
    },
    shopButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
        marginTop: 20,
        width: '100%',
        justifyContent: 'center',
    },
    shopButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    closeButton: {
        paddingVertical: 16,
    },
    closeButtonText: {
        fontSize: 14,
    },
});
