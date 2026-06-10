import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    Dimensions,
    RefreshControl,
    Linking,
    Alert,
    Share,
    Modal,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';

if (Platform.OS === 'android') {
    UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
import { Image } from 'expo-image';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { User, Post, Product } from '@/types';
import StylistModal from '@/components/StylistModal';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { usePostsStore } from '@/stores/postsStore';
import ProductCard from '@/components/ProductCard';
import ProductDetailModal from '@/components/ProductDetailModal';
import ProductUploadModal from './ProductUploadModal';
import TutorialModal, { useFirstVisitTutorial, TutorialStep } from '@/components/TutorialModal';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 4) / 3;
const BANNER_HEIGHT = 128;

const MARKETPLACE_TUTORIAL_STEPS: TutorialStep[] = [
    {
        icon: 'shopping-bag',
        title: 'Your Storefront',
        body: 'List items for sale from your Shop tab — buyers can browse and purchase directly from your profile.',
    },
    {
        icon: 'star',
        title: 'Styling Requests',
        body: 'As a verified stylist, clients can book styling sessions and message you directly for requests.',
    },
    {
        icon: 'dollar-sign',
        title: 'Get Paid',
        body: 'Payments for sales and styling sessions go straight to your connected account. Track everything from your profile.',
    },
];

export interface Draft {
    id: string;
    type: 'board' | 'post';
    thumbnail_url: string | null;
    created_at: string;
    updated_at: string;
}

interface ProfileViewProps {
    user: User;
    posts: Post[];
    savedPosts?: Post[];
    drafts?: Draft[];
    isOwnProfile: boolean;
    isFollowing?: boolean;
    onFollow?: () => void;
    onMessage?: () => void;
    onEditProfile?: () => void;
    onAiFaceUpload?: () => void;
    onDeleteDraft?: (id: string) => void;
    onOpenDrafts?: () => void;
    onRefresh?: () => void;
    refreshing?: boolean;
    stats: {
        followers: number;
        following: number;
        fits: number;
    };
}

export default function ProfileView({
    user,
    posts,
    savedPosts = [],
    drafts = [],
    isOwnProfile,
    isFollowing,
    onFollow,
    onMessage,
    onEditProfile,
    onAiFaceUpload,
    onDeleteDraft,
    onOpenDrafts,
    onRefresh,
    refreshing = false,
    stats,
}: ProfileViewProps) {
    const { colors, isDark } = useTheme();
    const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'shop'>('posts');
    const [showStylistModal, setShowStylistModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);

    // Marketplace state
    const { products, isLoadingProducts, fetchSellerProducts, deleteProduct } = useMarketplaceStore();
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    // First-time marketplace/stylist tutorial (own profile only)
    const showsMarketplaceFeatures = isOwnProfile && (user.is_business_account || user.is_verified_stylist);
    const { visible: showMarketplaceTutorial, dismiss: dismissMarketplaceTutorial } = useFirstVisitTutorial(
        'has_seen_marketplace_tutorial',
        showsMarketplaceFeatures
    );

    // Local posts mirror — lets us remove items instantly without waiting for prop refresh
    const [localPosts, setLocalPosts] = useState<Post[]>(posts);
    useEffect(() => { setLocalPosts(posts); }, [posts]);

    // Post long-press menu
    const { deletePost } = usePostsStore();
    const [postMenuPost, setPostMenuPost] = useState<Post | null>(null);

    const handleLongPressPost = (post: Post) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setPostMenuPost(post);
    };

    const handleSharePost = async (post: Post) => {
        setPostMenuPost(null);
        try {
            await Share.share({ message: `Check out this fit! 🔥` });
        } catch {}
    };

    const handleDeletePost = (post: Post) => {
        setPostMenuPost(null);
        Alert.alert(
            'Delete Post',
            'Are you sure you want to delete this post? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setLocalPosts(prev => prev.filter(p => p.id !== post.id));
                        deletePost(post.id);
                    },
                },
            ]
        );
    };

    // Fetch products when entering shop tab or user changes
    useEffect(() => {
        if (activeTab === 'shop' && user.id) {
            fetchSellerProducts(user.id);
        }
    }, [activeTab, user.id]);

    // Reset tab if business account is turned off
    useEffect(() => {
        if (!user.is_business_account && activeTab === 'shop') {
            setActiveTab('posts');
        }
    }, [user.is_business_account]);

    const displayData = activeTab === 'posts' ? localPosts : activeTab === 'saved' ? savedPosts : products;

    const handleOpenLink = async (link: string) => {
        if (!link) return;
        // Auto-prefix if no protocol
        const url = /^https?:\/\//i.test(link) ? link : `https://${link}`;
        try {
            await Linking.openURL(url);
        } catch (error) {
            Alert.alert('Cannot Open Link', 'Unable to open this URL.');
        }
    };

    const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

    const renderBio = (bio: string) => {
        const parts = bio.split(URL_REGEX);
        return (
            <Text style={[styles.bio, { color: colors.text }]}>
                {parts.map((part, i) =>
                    URL_REGEX.test(part) ? (
                        <Text
                            key={i}
                            style={{ color: '#3b82f6' }}
                            onPress={() => handleOpenLink(part)}
                        >
                            {part}
                        </Text>
                    ) : (
                        <Text key={i}>{part}</Text>
                    )
                )}
            </Text>
        );
    };

    const handleDeleteProduct = async (productId: string) => {
        try {
            await deleteProduct(productId);
            Alert.alert('Success', 'Product deleted successfully.');
        } catch (error) {
            Alert.alert('Error', 'Failed to delete product. Please try again.');
        }
    };

    const renderItem = ({ item }: { item: Post | Product }) => {
        if (activeTab === 'shop') {
            // It's a product - use flex size for proper 2-column grid like DressingRoomPreview
            const product = item as Product;
            return (
                <ProductCard
                    product={product}
                    onPress={() => setSelectedProduct(product)}
                    size="flex"
                    onDelete={isOwnProfile ? () => handleDeleteProduct(product.id) : undefined}
                />
            );
        }

        // It's a post
        const post = item as Post;
        return (
            <Pressable
                style={styles.gridItem}
                onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
                onLongPress={isOwnProfile ? () => handleLongPressPost(post) : undefined}
                delayLongPress={400}
            >
                <Image
                    source={{ uri: post.generated_image }}
                    style={styles.gridImage}
                    contentFit="cover"
                />
                {post.is_liked && (
                    <View style={styles.likedIndicator}>
                        <Text style={{ fontSize: 10 }}>🔥</Text>
                    </View>
                )}
            </Pressable>
        );
    };

    const ListHeader = () => (
        <>
            {/* Banner */}
            <View style={[styles.banner, { backgroundColor: colors.backgroundTertiary }]}>
                {user.header_url ? (
                    <Image source={{ uri: user.header_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : null}
            </View>

            {/* Profile Content */}
            <View style={styles.profileContent}>
                {/* Top Row: Avatar + Action Buttons */}
                <View style={styles.topRow}>
                    {/* Avatar with Status Dot */}
                    <View style={[styles.avatarContainer, { borderColor: colors.background }]}>
                        {user.avatar_url ? (
                            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                                <Feather name="user" size={40} color={colors.textTertiary} />
                            </View>
                        )}
                        {/* Status Dot */}
                        {user.show_activity_status !== false && (
                            <View style={[styles.statusDot, { borderColor: colors.background }]} />
                        )}
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionButtonsRow}>
                        {isOwnProfile ? (
                            <>

                                <Pressable
                                    style={[styles.editButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                                    onPress={onEditProfile}
                                >
                                    <Text style={[styles.editButtonText, { color: colors.text }]}>Edit Profile</Text>
                                </Pressable>
                            </>
                        ) : (
                            <>
                                <Pressable style={[styles.messageIconButton, { backgroundColor: colors.backgroundSecondary }]} onPress={onMessage}>
                                    <Feather name="message-circle" size={18} color={colors.text} />
                                </Pressable>
                                <Pressable
                                    style={[
                                        styles.followButton,
                                        isFollowing
                                            ? { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1 }
                                            : { backgroundColor: colors.text }
                                    ]}
                                    onPress={onFollow}
                                >
                                    <Text style={[
                                        styles.followButtonText,
                                        { color: isFollowing ? colors.text : colors.background }
                                    ]}>
                                        {isFollowing ? 'Following' : 'Follow'}
                                    </Text>
                                </Pressable>
                            </>
                        )}
                    </View>
                </View>

                {/* Identity Section with Favorites */}
                <View style={styles.identityRow}>
                    {/* Left Column: Name, Handle, Location, Bio */}
                    <View style={styles.identityLeft}>
                        {/* Name + Verified Badge */}
                        <View style={styles.nameRow}>
                            <Text style={[styles.username, { color: colors.text }]}>{user.username}</Text>
                            {user.is_verified_stylist && (
                                <MaterialCommunityIcons name="check-decagram" size={20} color="#3b82f6" style={{ marginLeft: 6 }} />
                            )}
                            {user.is_business_account && (
                                <Feather name="shopping-bag" size={18} color="#3b82f6" style={{ marginLeft: 6 }} />
                            )}
                            {user.is_verified_boutique && (
                                <Ionicons name="shield-checkmark" size={18} color="#22c55e" style={{ marginLeft: 6 }} />
                            )}
                        </View>

                        {/* Handle */}
                        <Text style={[styles.handle, { color: colors.textSecondary }]}>{user.handle}</Text>

                        {/* Location + Active Status */}
                        <View style={styles.locationRow}>
                            {user.location && (
                                <>
                                    <Feather name="map-pin" size={12} color={colors.textTertiary} />
                                    <Text style={[styles.locationText, { color: colors.textTertiary }]} numberOfLines={1}>
                                        {user.location}
                                    </Text>
                                </>
                            )}
                            {user.show_activity_status !== false && (
                                <>
                                    <Text style={{ color: colors.textTertiary, marginHorizontal: 6 }}>•</Text>
                                    <Text style={[styles.activeText, { color: '#10b981' }]}>Active now</Text>
                                </>
                            )}
                        </View>

                        {/* Bio */}
                        {user.bio && renderBio(user.bio)}

                        {/* Website */}
                        {user.website && (
                            <Pressable style={styles.linkRow} onPress={() => handleOpenLink(user.website!)}>
                                <Feather name="link" size={12} color="#3b82f6" />
                                <Text style={[styles.linkText, { color: '#3b82f6' }]} numberOfLines={1}>
                                    {user.website.replace(/^https?:\/\//, '')}
                                </Text>
                            </Pressable>
                        )}
                    </View>

                    {/* Right Column: Favorite Pills */}
                    <View style={styles.favoritesColumn}>
                        {user.favorite_brand && (
                            <View style={[styles.favoritePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                                <Text style={styles.pillEmoji}>🫶</Text>
                                <Text style={[styles.pillText, { color: colors.text }]}>{user.favorite_brand}</Text>
                            </View>
                        )}
                        {user.favorite_song && (() => {
                            const { title, artist, url } = user.favorite_song!;
                            const label = artist ? `${artist} - ${title}` : title;
                            const pillStyle = [styles.favoritePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }];
                            const inner = (
                                <>
                                    <Feather name="music" size={12} color={colors.textSecondary} />
                                    <Text style={[styles.pillText, { color: colors.text }]}>
                                        {label}
                                    </Text>
                                </>
                            );
                            return url ? (
                                <Pressable
                                    style={({ pressed }) => [...pillStyle, pressed && { opacity: 0.7 }]}
                                    onPress={() => Linking.openURL(url)}
                                >
                                    {inner}
                                </Pressable>
                            ) : (
                                <View style={pillStyle}>{inner}</View>
                            );
                        })()}
                    </View>
                </View>

                {/* Stats & Socials Row */}
                <View style={styles.statsSocialsRow}>
                    <View style={styles.statsGroup}>
                        <Pressable style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: colors.text }]}>{stats.followers}</Text>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>followers</Text>
                        </Pressable>
                        <Pressable style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: colors.text }]}>{stats.following}</Text>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>following</Text>
                        </Pressable>
                        <View style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: colors.text }]}>{localPosts.length}</Text>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>fits</Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.socialsGroup}>
                        {user.socials?.instagram && (
                            <Pressable onPress={() => handleOpenLink(`https://instagram.com/${user.socials!.instagram}`)}>
                                <Ionicons name="logo-instagram" size={20} color={colors.textSecondary} />
                            </Pressable>
                        )}
                        {user.socials?.tiktok && (
                            <Pressable onPress={() => handleOpenLink(`https://tiktok.com/@${user.socials!.tiktok}`)}>
                                <Ionicons name="logo-tiktok" size={20} color={colors.textSecondary} />
                            </Pressable>
                        )}
                        {user.socials?.twitter && (
                            <Pressable onPress={() => handleOpenLink(`https://twitter.com/${user.socials!.twitter}`)}>
                                <Ionicons name="logo-twitter" size={20} color={colors.textSecondary} />
                            </Pressable>
                        )}
                    </View>
                </View>

                {/* AI Face Card (Own Profile Only) */}
                {isOwnProfile && (
                    <Pressable
                        style={[styles.faceCard, {
                            backgroundColor: user.ai_face_url ? 'rgba(16, 185, 129, 0.1)' : 'rgba(168, 85, 247, 0.1)',
                            borderColor: user.ai_face_url ? '#10b981' : '#a855f7'
                        }]}
                        onPress={onAiFaceUpload}
                    >
                        <View style={[styles.faceIcon, { backgroundColor: user.ai_face_url ? '#d1fae5' : '#f3e8ff' }]}>
                            {user.ai_face_url ? (
                                <Image source={{ uri: user.ai_face_url }} style={styles.faceImage} />
                            ) : (
                                <Feather name="camera" size={20} color="#a855f7" />
                            )}
                        </View>
                        <View style={styles.faceInfo}>
                            <View style={styles.faceTitleRow}>
                                <Text style={[styles.faceTitle, { color: user.ai_face_url ? '#065f46' : '#6b21a8' }]}>
                                    Get Emode AI Access
                                </Text>
                                {user.ai_face_url && (
                                    <MaterialCommunityIcons name="check-circle" size={18} color="#10b981" style={{ marginLeft: 4 }} />
                                )}
                            </View>
                            <Text style={[styles.faceSubtitle, { color: user.ai_face_url ? '#065f46' : '#6b21a8' }]}>
                                {user.ai_face_url ? 'Face data saved. Ready for Nano Banana.' : 'Upload face for AI styling.'}
                            </Text>
                        </View>
                        <View style={[styles.faceButton, { backgroundColor: user.ai_face_url ? '#10b981' : '#a855f7' }]}>
                            <Text style={styles.faceButtonText}>{user.ai_face_url ? 'Change' : 'Upload'}</Text>
                        </View>
                    </Pressable>
                )}

                {/* Tabs (Own Profile) or Grid Header (Other Users) */}
                {isOwnProfile || user.is_business_account ? (
                    <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
                        <Pressable
                            style={[styles.tabButton, activeTab === 'posts' && [styles.tabButtonActive, { borderBottomColor: colors.text }]]}
                            onPress={() => setActiveTab('posts')}
                        >
                            <Feather name="grid" size={16} color={activeTab === 'posts' ? colors.text : colors.textSecondary} />
                            <Text style={[styles.tabText, { color: activeTab === 'posts' ? colors.text : colors.textSecondary }]}>
                                {isOwnProfile ? 'My Fits' : 'Fits'}
                            </Text>
                        </Pressable>

                        {user.is_business_account && (
                            <Pressable
                                style={[styles.tabButton, activeTab === 'shop' && [styles.tabButtonActive, { borderBottomColor: colors.text }]]}
                                onPress={() => setActiveTab('shop')}
                            >
                                <Feather name="shopping-bag" size={16} color={activeTab === 'shop' ? colors.text : colors.textSecondary} />
                                <Text style={[styles.tabText, { color: activeTab === 'shop' ? colors.text : colors.textSecondary }]}>Shop</Text>
                            </Pressable>
                        )}

                        <Pressable
                            style={[styles.tabButton, activeTab === 'saved' && [styles.tabButtonActive, { borderBottomColor: colors.text }]]}
                            onPress={() => setActiveTab('saved')}
                        >
                            <Feather name="bookmark" size={16} color={activeTab === 'saved' ? colors.text : colors.textSecondary} />
                            <Text style={[styles.tabText, { color: activeTab === 'saved' ? colors.text : colors.textSecondary }]}>Saved</Text>
                        </Pressable>
                    </View>
                ) : (
                    <View style={[styles.postsHeader, { borderBottomColor: colors.text }]}>
                        <Feather name="grid" size={20} color={colors.text} />
                    </View>
                )}

                {/* Shop Tab Sub-header for Product Stats/Add Button */}
                {activeTab === 'shop' && (
                    <View style={[styles.shopHeader, { paddingTop: 16, paddingHorizontal: 4 }]}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
                            {products.length} product{products.length !== 1 ? 's' : ''}
                        </Text>
                        {isOwnProfile && (
                            <Pressable style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => setShowUploadModal(true)}>
                                <Feather name="plus" size={14} color="#fff" />
                                <Text style={styles.addButtonText}>Add</Text>
                            </Pressable>
                        )}
                    </View>
                )}
            </View>
        </>
    );

    return (
        <>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <FlatList
                    data={displayData}
                    keyExtractor={(item) => item.id}
                    numColumns={activeTab === 'shop' ? 2 : 3}
                    key={activeTab} // Force re-render when changing numColumns
                    renderItem={renderItem}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.text}
                            progressViewOffset={BANNER_HEIGHT}
                        />
                    }
                    ListHeaderComponent={ListHeader}
                    ListEmptyComponent={
                        <View style={styles.emptyGrid}>
                            <Feather
                                name={activeTab === 'posts' ? 'camera' : activeTab === 'saved' ? 'bookmark' : 'shopping-bag'}
                                size={48}
                                color={colors.textTertiary}
                            />
                            <Text style={[styles.emptyText, { color: colors.text }]}>
                                {activeTab === 'posts' ? 'No fits yet' : activeTab === 'saved' ? 'No saved posts' : 'No products'}
                            </Text>
                            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                                {activeTab === 'posts' ? 'Create your first fit!' : activeTab === 'saved' ? 'Save posts to see them here' :
                                    isOwnProfile ? 'Start selling your items!' : 'This shop is empty'}
                            </Text>
                            {activeTab === 'shop' && isOwnProfile && (
                                <Pressable style={[styles.emptyAddButton, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={() => setShowUploadModal(true)}>
                                    <Feather name="plus" size={18} color="#fff" />
                                    <Text style={styles.emptyAddButtonText}>Add Product</Text>
                                </Pressable>
                            )}
                        </View>
                    }
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 0 }}
                    columnWrapperStyle={activeTab === 'shop' ? { gap: 12, marginBottom: 12, paddingHorizontal: 16 } : undefined}
                    ListHeaderComponentStyle={activeTab === 'shop' ? { marginBottom: 16 } : undefined}
                />
            </View>

            {/* Stylist Verification Modal */}
            <StylistModal
                visible={showStylistModal}
                onClose={() => setShowStylistModal(false)}
            />

            {/* Product Upload Modal */}
            <ProductUploadModal
                visible={showUploadModal}
                onClose={() => setShowUploadModal(false)}
                onSuccess={() => {
                    if (user.id) fetchSellerProducts(user.id);
                }}
            />

            {/* Product Detail Modal */}
            <ProductDetailModal
                visible={!!selectedProduct}
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
            />

            {/* Post Long-Press Action Sheet */}
            <Modal
                visible={!!postMenuPost}
                transparent
                animationType="fade"
                onRequestClose={() => setPostMenuPost(null)}
            >
                <Pressable style={styles.postMenuOverlay} onPress={() => setPostMenuPost(null)}>
                    <View style={[styles.postMenuSheet, { backgroundColor: colors.backgroundSecondary }]}>
                        <Pressable
                            style={styles.postMenuItem}
                            onPress={() => postMenuPost && handleSharePost(postMenuPost)}
                        >
                            <Feather name="share" size={20} color={colors.text} />
                            <Text style={[styles.postMenuItemText, { color: colors.text }]}>Share</Text>
                        </Pressable>
                        <View style={[styles.postMenuDivider, { backgroundColor: colors.border }]} />
                        <Pressable
                            style={styles.postMenuItem}
                            onPress={() => postMenuPost && handleDeletePost(postMenuPost)}
                        >
                            <Feather name="trash-2" size={20} color="#ff4444" />
                            <Text style={[styles.postMenuItemText, { color: '#ff4444' }]}>Delete Post</Text>
                        </Pressable>
                        <View style={[styles.postMenuDivider, { backgroundColor: colors.border }]} />
                        <Pressable style={styles.postMenuItem} onPress={() => setPostMenuPost(null)}>
                            <Text style={[styles.postMenuCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>

            <TutorialModal
                visible={showMarketplaceTutorial}
                onDismiss={dismissMarketplaceTutorial}
                title="Selling & Styling"
                steps={MARKETPLACE_TUTORIAL_STEPS}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // Banner
    banner: {
        height: BANNER_HEIGHT,
        width: '100%',
        position: 'relative',
    },
    bannerOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    backButton: {
        position: 'absolute',
        top: 16,
        left: 16,
        borderRadius: 20,
        overflow: 'hidden',
    },
    backButtonBlur: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Profile Content
    profileContent: {
        paddingHorizontal: 20,
    },
    // Top Row: Avatar + Buttons
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: -48, // Overlap banner
    },
    avatarContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 4,
        position: 'relative',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 44,
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        borderRadius: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusDot: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#10b981',
        borderWidth: 3,
    },
    actionButtonsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    editButton: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 20,
        borderWidth: 1,
    },
    editButtonText: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },

    messageIconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    followButton: {
        paddingVertical: 10,
        paddingHorizontal: 24,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    followButtonText: {
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    // Identity Section
    identityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    identityLeft: {
        flex: 1,
        paddingRight: 12,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    username: {
        fontSize: 28,
        fontWeight: '900',
        fontFamily: 'Inter_900Black',
    },
    handle: {
        fontSize: 14,
        marginTop: 2,
        fontFamily: 'Inter_500Medium',
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    locationText: {
        fontSize: 12,
        marginLeft: 4,
        maxWidth: 120,
        fontFamily: 'Inter_400Regular',
    },
    activeText: {
        fontSize: 12,
        fontWeight: '500',
        fontFamily: 'Inter_500Medium',
    },
    bio: {
        fontSize: 14,
        marginTop: 10,
        lineHeight: 20,
        fontFamily: 'Inter_500Medium',
    },
    linkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 4,
    },
    linkText: {
        fontSize: 14,
        fontWeight: '500',
        fontFamily: 'Inter_500Medium',
    },
    // Favorites Column
    favoritesColumn: {
        alignItems: 'flex-end',
        gap: 8,
    },
    favoritePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        gap: 6,
    },
    pillEmoji: {
        fontSize: 14,
    },
    pillText: {
        fontSize: 12,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
        maxWidth: 80,
    },
    // Stats & Socials
    statsSocialsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingVertical: 8,
    },
    statsGroup: {
        flexDirection: 'row',
        gap: 28,
    },
    statItem: {
        alignItems: 'flex-start',
    },
    statNumber: {
        fontSize: 18,
        fontWeight: '900',
        fontFamily: 'Inter_900Black',
    },
    statLabel: {
        fontSize: 12,
        marginTop: 2,
        fontFamily: 'Inter_500Medium',
    },
    divider: {
        width: 1,
        height: 32,
        marginHorizontal: 20,
    },
    socialsGroup: {
        flexDirection: 'row',
        gap: 12,
    },
    // Face Card
    faceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 2,
        borderStyle: 'dashed',
        marginTop: 16,
        gap: 12,
    },
    faceIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    faceImage: {
        width: '100%',
        height: '100%',
    },
    faceInfo: {
        flex: 1,
    },
    faceTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    faceTitle: {
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    faceSubtitle: {
        fontSize: 12,
        marginTop: 2,
        fontFamily: 'Inter_400Regular',
    },
    faceButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 16,
    },
    faceButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    // Tabs
    tabsRow: {
        flexDirection: 'row',
        marginTop: 20,
        borderBottomWidth: 1,
    },
    tabButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabButtonActive: {
        borderBottomWidth: 2,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    postsHeader: {
        marginTop: 20,
        paddingVertical: 12,
        borderBottomWidth: 2,
        alignItems: 'center',
    },
    // Grid
    gridItem: {
        width: GRID_SIZE,
        height: GRID_SIZE,
        margin: 0.67,
    },
    gridImage: {
        width: '100%',
        height: '100%',
    },
    likedIndicator: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 8,
        padding: 2,
    },
    // Empty
    emptyGrid: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
        fontFamily: 'Inter_700Bold',
    },
    emptySubtext: {
        fontSize: 14,
        marginTop: 8,
        fontFamily: 'Inter_400Regular',
    },
    shopHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        gap: 4,
    },
    addButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        fontFamily: 'Inter_600SemiBold',
    },
    emptyAddButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 10,
        gap: 8,
    },
    emptyAddButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    postMenuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    postMenuSheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 32,
        overflow: 'hidden',
    },
    postMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 18,
        gap: 14,
    },
    postMenuItemText: {
        fontSize: 16,
        fontWeight: '500',
    },
    postMenuDivider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 20,
    },
    postMenuCancelText: {
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
        flex: 1,
    },
});
