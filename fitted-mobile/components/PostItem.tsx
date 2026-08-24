import React, { useState, useRef } from 'react';
import { StyleSheet, Pressable, Image, Dimensions, View as RNView, Text as RNText, FlatList, Modal, Linking, Alert, Share } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';

import MentionText from '@/components/MentionText';
import { Post, ClothingItem } from '@/types';
import SaveItemButton from '@/components/SaveItemButton';
import { useTheme } from '@/hooks/useTheme';
import { reportContent, blockUser } from '@/services/moderation';

const { width } = Dimensions.get('window');
const POST_SIZE = width;

interface PostItemProps {
    post: Post;
    onLike: () => void;
    onComment: () => void;
    onShare: () => void;
    onSave: () => void;
    onUserPress: () => void;
    onPostPress?: () => void;
    onDelete?: () => void;
    onBlocked?: (blockedUserId: string) => void;
    currentUserId?: string;
}

// Item Link Modal — shows the tapped item's details with a link circle for its purchase link
function ItemLinkModal({
    visible,
    item,
    onClose,
    postId,
}: {
    visible: boolean;
    item: ClothingItem | null;
    onClose: () => void;
    postId?: string;
}) {
    const { colors } = useTheme();

    if (!item) return null;

    const openLink = async (url: string) => {
        const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        try { await Linking.openURL(fullUrl); } catch {}
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.modalOverlay} onPress={onClose}>
                <Pressable style={[styles.modalContent, { backgroundColor: colors.background }]} onPress={e => e.stopPropagation()}>
                    {/* Item image, with the save control on its corner. These are
                        pieces somebody actually wore, so this is the sheet where
                        saving matters most -- link or no link. */}
                    <RNView style={styles.modalImageWrap}>
                        <ExpoImage
                            source={{ uri: item.image_url }}
                            style={styles.modalItemImage}
                            contentFit="contain"
                        />
                        <SaveItemButton
                            item={{
                                brandName: item.brand,
                                name: item.name,
                                imageUrl: item.image_url,
                                productUrl: item.purchase_link || null,
                                price: item.price || null,
                                sourcePostId: postId ?? null,
                            }}
                            size={18}
                        />
                    </RNView>

                    {/* Item details */}
                    <RNText style={[styles.modalBrand, { color: colors.textSecondary }]}>{item.brand}</RNText>
                    <RNText style={[styles.modalName, { color: colors.text }]}>{item.name}</RNText>
                    {item.price > 0 && (
                        <RNText style={[styles.modalPrice, { color: colors.primary }]}>${item.price}</RNText>
                    )}

                    {/* Link circle(s) for this item — one per purchase URL, max 5 */}
                    {item.purchase_link && (
                        <RNView style={styles.linksRow}>
                            {item.purchase_link.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5).map((url, idx) => (
                                <Pressable
                                    key={idx}
                                    style={({ pressed }) => [styles.linkWrapper, { opacity: pressed ? 0.7 : 1 }]}
                                    onPress={() => openLink(url)}
                                >
                                    <RNView style={[styles.linkCircle, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                                        <RNText style={styles.linkEmoji}>🔗</RNText>
                                    </RNView>
                                </Pressable>
                            ))}
                        </RNView>
                    )}

                    <Pressable style={styles.modalCloseButton} onPress={onClose}>
                        <RNText style={[styles.modalCloseText, { color: colors.textTertiary }]}>Close</RNText>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

export default function PostItem({ post, onLike, onComment, onShare, onSave, onUserPress, onPostPress, onDelete, onBlocked, currentUserId }: PostItemProps) {
    const { colors } = useTheme();
    const user = post.user;
    const flatListRef = useRef<FlatList>(null);
    const lastTap = useRef<number>(0);

    // Carousel state
    const [currentSlide, setCurrentSlide] = useState(0);
    const [showItemTags, setShowItemTags] = useState(false);

    // Item modal state
    const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    // Menu modal state
    const [menuVisible, setMenuVisible] = useState(false);
    const isOwnPost = currentUserId && post.user_id === currentUserId;

    const handleItemPress = (item: ClothingItem) => {
        setSelectedItem(item);
        setModalVisible(true);
    };

    const toggleItemTags = () => {
        setShowItemTags(!showItemTags);
    };

    const handleDelete = () => {
        setMenuVisible(false);
        Alert.alert(
            'Delete Post',
            'Are you sure you want to delete this post? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => onDelete?.()
                },
            ]
        );
    };

    const handleReport = () => {
        setMenuVisible(false);
        Alert.alert(
            'Report Post',
            'Report this post for objectionable content? Our team will review it.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Report',
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await reportContent({
                            contentType: 'post',
                            contentId: post.id,
                            reportedUserId: post.user_id,
                        });
                        Alert.alert(
                            error ? 'Error' : 'Reported',
                            error || 'Thanks for letting us know. We\'ll review this post.'
                        );
                    },
                },
            ]
        );
    };

    const handleBlock = () => {
        setMenuVisible(false);
        const name = post.user?.username || 'this user';
        Alert.alert(
            'Block User',
            `Block ${name}? You won't see their posts, and they won't be able to interact with you.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Block',
                    style: 'destructive',
                    onPress: async () => {
                        if (!post.user_id) return;
                        const { error } = await blockUser(post.user_id);
                        if (error) { Alert.alert('Error', error); return; }
                        onBlocked?.(post.user_id);
                    },
                },
            ]
        );
    };

    // Handle single tap (show tags) and double tap (like)
    const handleImageTap = () => {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;

        if (now - lastTap.current < DOUBLE_TAP_DELAY) {
            // Double tap - like
            onLike();
            lastTap.current = 0;
        } else {
            // Single tap - toggle tags
            lastTap.current = now;
            setTimeout(() => {
                if (lastTap.current === now) {
                    toggleItemTags();
                }
            }, DOUBLE_TAP_DELAY);
        }
    };

    // Items worth tagging: anything whose brand the poster actually named.
    //
    // This used to require a purchase_link too, which made the tag button look
    // broken — you could tag three pieces, tap it, and get nothing, because
    // pasting a URL is optional and almost nobody does it. A named brand is the
    // useful part; the item sheet offers the retailer link when there is one and
    // a search when there is not.
    const knownItems = (post.items || []).filter(item =>
        item.brand &&
        item.brand.toLowerCase() !== 'unknown'
    );

    // Build "wearing" text from known items only
    const wearingText = knownItems.length > 0
        ? knownItems.map(item => item.brand).filter(Boolean).join(', ')
        : null;

    // Only show board slide if there is a board image
    const hasBoardImage = !!post.board_image;
    const slides = hasBoardImage
        ? [{ type: 'outfit', image: post.generated_image }, { type: 'board', image: post.board_image }]
        : [{ type: 'outfit', image: post.generated_image }];

    const renderSlide = ({ item, index }: { item: { type: string; image: string | undefined }; index: number }) => (
        <Pressable onPress={handleImageTap}>
            <RNView style={[styles.imageContainer, { backgroundColor: colors.backgroundSecondary }]}>
                <ExpoImage
                    source={{ uri: item.image }}
                    style={styles.image}
                    contentFit="cover"
                    transition={200}
                />

                {/* Stacked tags on outfit slide (center-left) */}
                {item.type === 'outfit' && showItemTags && knownItems.length > 0 && (
                    <RNView style={styles.stackedTagsContainer}>
                        {knownItems.map((clothingItem, idx) => (
                            <Pressable
                                key={clothingItem.id || idx}
                                style={styles.tagPill}
                                onPress={() => handleItemPress(clothingItem)}
                            >
                                <Feather name="shopping-bag" size={14} color="#000" />
                                <RNText style={styles.tagPillText} numberOfLines={1}>
                                    {clothingItem.brand}
                                </RNText>
                            </Pressable>
                        ))}
                    </RNView>
                )}

                {/* Positioned tags on board slide (at item locations) */}
                {item.type === 'board' && showItemTags && knownItems.map((clothingItem, idx) => {
                    const position = clothingItem.canvas_state;
                    if (!position) return null;

                    const scaledX = (position.x / POST_SIZE) * 100;
                    const scaledY = (position.y / POST_SIZE) * 100;

                    return (
                        <Pressable
                            key={clothingItem.id || idx}
                            style={[
                                styles.tagPill,
                                styles.tagPillPositioned,
                                { left: `${scaledX}%`, top: `${scaledY}%` }
                            ]}
                            onPress={() => handleItemPress(clothingItem)}
                        >
                            <Feather name="shopping-bag" size={14} color="#000" />
                            <RNText style={styles.tagPillText} numberOfLines={1}>
                                {clothingItem.brand}
                            </RNText>
                        </Pressable>
                    );
                })}
            </RNView>
        </Pressable>
    );

    return (
        <RNView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <Pressable style={styles.header} onPress={onUserPress}>
                <RNView style={styles.userInfo}>
                    {user?.avatar_url ? (
                        <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
                    ) : (
                        <RNView style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                            <Feather name="user" size={16} color={colors.textTertiary} />
                        </RNView>
                    )}
                    <RNView style={styles.userText}>
                        <RNText style={[styles.username, { color: colors.text }]}>{user?.handle || '@user'}</RNText>
                        {wearingText && (
                            <RNText style={[styles.wearingText, { color: colors.textSecondary }]} numberOfLines={1}>
                                Wearing {wearingText}
                            </RNText>
                        )}
                    </RNView>
                </RNView>
                <Pressable onPress={(e) => { e.stopPropagation(); setMenuVisible(true); }} hitSlop={8}>
                    <Feather name="more-horizontal" size={20} color={colors.textSecondary} />
                </Pressable>
            </Pressable>

            {/* Two-Slide Carousel */}
            <RNView style={styles.carouselWrapper}>
                <FlatList
                    ref={flatListRef}
                    data={slides}
                    renderItem={renderSlide}
                    keyExtractor={(_, index) => index.toString()}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) => {
                        const newIndex = Math.round(e.nativeEvent.contentOffset.x / POST_SIZE);
                        setCurrentSlide(newIndex);
                    }}
                />

                {/* Fixed Overlay Actions - doesn't scroll with carousel */}
                <RNView style={styles.actionsOverlay} pointerEvents="box-none">
                    <Pressable style={styles.actionButton} onPress={onLike}>
                        <Ionicons
                            name={post.is_liked ? "flame" : "flame-outline"}
                            size={26}
                            color={post.is_liked ? "#ff9500" : "#fff"}
                        />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={onComment}>
                        <Feather name="message-circle" size={24} color="#fff" />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={onShare}>
                        <Feather name="send" size={24} color="#fff" />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={onSave}>
                        <Ionicons
                            name={post.is_saved ? "bookmark" : "bookmark-outline"}
                            size={24}
                            color="#fff"
                        />
                    </Pressable>
                </RNView>

                {/* Fixed Pagination Dots with pill wrapper */}
                {slides.length > 1 && (
                    <RNView style={styles.paginationOverlay}>
                        <RNView style={styles.paginationPill}>
                            {slides.map((_, idx) => (
                                <RNView
                                    key={idx}
                                    style={[
                                        styles.dot,
                                        { backgroundColor: currentSlide === idx ? '#fff' : 'rgba(255,255,255,0.5)' }
                                    ]}
                                />
                            ))}
                        </RNView>
                    </RNView>
                )}

                {/* Fixed Tag Toggle Button - shows on all slides */}
                {knownItems.length > 0 && (
                    <Pressable
                        style={styles.tagToggle}
                        onPress={toggleItemTags}
                    >
                        <Feather name="tag" size={18} color={showItemTags ? "#22c55e" : "#fff"} />
                    </Pressable>
                )}
            </RNView>

            {/* Music Bar */}
            {post.music && (
                <RNView style={[styles.musicBar, { backgroundColor: colors.backgroundSecondary }]}>
                    <Feather name="music" size={16} color={colors.primary} />
                    <RNText style={[styles.musicText, { color: colors.text }]} numberOfLines={1}>
                        {post.music.title} • {post.music.artist}
                    </RNText>
                </RNView>
            )}

            {/* Footer - Tap to open post detail */}
            <Pressable
                style={[styles.footer, !post.caption && styles.footerCompact]}
                onPress={onPostPress}
                disabled={!onPostPress}
            >
                <RNText style={[styles.likes, { color: colors.text }, !post.caption && { marginBottom: 0 }]}>{post.likes_count || 0} flames</RNText>
                {post.caption ? (
                    <RNText style={[styles.caption, { color: colors.text }]}>
                        <RNText style={styles.captionUsername} onPress={(e) => { e.stopPropagation?.(); onUserPress(); }}>{user?.handle || user?.username} </RNText>
                        <MentionText text={post.caption} style={[styles.captionText, { color: colors.text }]} />
                    </RNText>
                ) : null}
                <RNText style={[styles.timestamp, { color: colors.textTertiary }, !post.caption && { marginTop: 2 }]}>
                    {formatTime(post.created_at)}
                </RNText>
            </Pressable>

            {/* Post Menu Modal */}
            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuVisible(false)}
            >
                <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
                    <RNView style={[styles.menuContent, { backgroundColor: colors.backgroundSecondary }]}>
                        {isOwnPost && onDelete && (
                            <Pressable style={styles.menuItem} onPress={handleDelete}>
                                <Feather name="trash-2" size={20} color="#ff4444" />
                                <RNText style={[styles.menuItemText, { color: '#ff4444' }]}>Delete Post</RNText>
                            </Pressable>
                        )}
                        {!isOwnPost && (
                            <>
                                <Pressable style={styles.menuItem} onPress={handleReport}>
                                    <Feather name="flag" size={20} color={colors.text} />
                                    <RNText style={[styles.menuItemText, { color: colors.text }]}>Report Post</RNText>
                                </Pressable>
                                <Pressable style={styles.menuItem} onPress={handleBlock}>
                                    <Feather name="slash" size={20} color="#ff4444" />
                                    <RNText style={[styles.menuItemText, { color: '#ff4444' }]}>Block User</RNText>
                                </Pressable>
                            </>
                        )}
                        <Pressable style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                            <Feather name="x" size={20} color={colors.textTertiary} />
                            <RNText style={[styles.menuItemText, { color: colors.textTertiary }]}>Cancel</RNText>
                        </Pressable>
                    </RNView>
                </Pressable>
            </Modal>

            {/* Item Link Modal */}
            <ItemLinkModal
                visible={modalVisible}
                item={selectedItem}
                onClose={() => setModalVisible(false)}
                postId={post.id}
            />
        </RNView>
    );
}

function formatTime(timestamp: string): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    avatarPlaceholder: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userText: {
        marginLeft: 10,
    },
    username: {
        fontSize: 14,
        fontWeight: '600',
    },
    wearingText: {
        fontSize: 12,
        marginTop: 1,
    },
    carouselWrapper: {
        position: 'relative',
    },
    imageContainer: {
        width: POST_SIZE,
        height: POST_SIZE,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    actionsOverlay: {
        position: 'absolute',
        right: 12,
        bottom: 12,
    },
    actionButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    tagToggle: {
        position: 'absolute',
        left: 12,
        bottom: 12,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stackedTagsContainer: {
        position: 'absolute',
        left: 20,
        // Centred by the layout rather than by a guess. translateY was a flat
        // -50px, which only lands centre for one particular stack height -- with
        // three pills it hung low, and the more brands a fit tagged the further
        // out it drifted.
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        // Never let a long brand name run under the action rail on the right.
        maxWidth: '62%',
        gap: 10,
    },
    tagPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 20,
        gap: 8,
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)',
        elevation: 3,
    },
    tagPillPositioned: {
        position: 'absolute',
    },
    tagPillText: {
        color: '#000',
        fontSize: 13,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    paginationOverlay: {
        position: 'absolute',
        bottom: 12,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    paginationPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 6,
    },
    musicBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    musicText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
    },
    footer: {
        padding: 12,
    },
    footerCompact: {
        paddingVertical: 8,
    },
    likes: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    caption: {
        fontSize: 14,
        lineHeight: 20,
    },
    captionUsername: {
        fontWeight: '600',
    },
    captionText: {},
    timestamp: {
        fontSize: 12,
        marginTop: 6,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 8,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 20,
        letterSpacing: 0.3,
    },
    modalItemImage: {
        width: 150,
        height: 150,
        borderRadius: 8,
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
        fontSize: 20,
        fontWeight: '700',
        marginTop: 8,
        marginBottom: 4,
    },
    linksRow: {
        flexDirection: 'row',
        gap: 16,
        justifyContent: 'center',
        marginBottom: 8,
    },
    linkWrapper: {
        alignItems: 'center',
        gap: 6,
        width: 64,
    },
    linkCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    linkEmoji: {
        fontSize: 22,
    },
    linkLabel: {
        fontSize: 11,
        textAlign: 'center',
        width: 64,
    },
    modalImageWrap: {
        // Sized to the image so the absolute heart lands on its corner rather
        // than the sheet's.
        width: 150,
        height: 150,
        marginBottom: 16,
    },
    modalCloseButton: {
        paddingVertical: 16,
    },
    modalCloseText: {
        fontSize: 14,
    },
    // Menu styles
    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuContent: {
        borderRadius: 12,
        minWidth: 200,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    menuItemText: {
        fontSize: 16,
        fontWeight: '500',
    },
});
