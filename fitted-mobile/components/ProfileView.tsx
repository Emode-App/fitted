import React, { useState } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';
import { User, Post } from '@/types';
import StylistModal from '@/components/StylistModal';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 4) / 3;
const BANNER_HEIGHT = 128;

interface ProfileViewProps {
    user: User;
    posts: Post[];
    savedPosts?: Post[];
    isOwnProfile: boolean;
    isFollowing?: boolean;
    onFollow?: () => void;
    onMessage?: () => void;
    onEditProfile?: () => void;
    onAiFaceUpload?: () => void;
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
    isOwnProfile,
    isFollowing,
    onFollow,
    onMessage,
    onEditProfile,
    onAiFaceUpload,
    onRefresh,
    refreshing = false,
    stats,
}: ProfileViewProps) {
    const { colors, isDark } = useTheme();
    const [activeTab, setActiveTab] = useState<'posts' | 'saved'>('posts');
    const [showStylistModal, setShowStylistModal] = useState(false);

    const displayPosts = activeTab === 'posts' ? posts : savedPosts;

    const handleOpenLink = async (link: string) => {
        if (link) {
            try {
                const canOpen = await Linking.canOpenURL(link);
                if (canOpen) {
                    await Linking.openURL(link);
                } else {
                    Alert.alert('Cannot Open Link', 'Unable to open this URL.');
                }
            } catch (error) {
                console.error('Error opening link:', error);
            }
        }
    };

    const renderPostThumbnail = ({ item }: { item: Post }) => (
        <Pressable
            style={styles.gridItem}
            onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
        >
            <Image
                source={{ uri: item.generated_image }}
                style={styles.gridImage}
                contentFit="cover"
            />
            {item.is_liked && (
                <View style={styles.likedIndicator}>
                    <Text style={{ fontSize: 10 }}>🔥</Text>
                </View>
            )}
        </Pressable>
    );

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
                        {user.bio && (
                            <Text style={[styles.bio, { color: colors.text }]}>{user.bio}</Text>
                        )}

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
                        {user.favorite_song && (
                            <View style={[styles.favoritePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                                <Feather name="music" size={12} color={colors.textSecondary} />
                                <Text style={[styles.pillText, { color: colors.text }]} numberOfLines={1}>
                                    {user.favorite_song.title}
                                </Text>
                            </View>
                        )}
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
                            <Text style={[styles.statNumber, { color: colors.text }]}>{stats.fits}</Text>
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
                                    Get Fitted AI Access
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
                {isOwnProfile ? (
                    <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
                        <Pressable
                            style={[styles.tabButton, activeTab === 'posts' && [styles.tabButtonActive, { borderBottomColor: colors.text }]]}
                            onPress={() => setActiveTab('posts')}
                        >
                            <Feather name="grid" size={16} color={activeTab === 'posts' ? colors.text : colors.textSecondary} />
                            <Text style={[styles.tabText, { color: activeTab === 'posts' ? colors.text : colors.textSecondary }]}>My Fits</Text>
                        </Pressable>
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
            </View>
        </>
    );

    return (
        <>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <FlatList
                    data={displayPosts}
                    keyExtractor={(item) => item.id}
                    numColumns={3}
                    renderItem={renderPostThumbnail}
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
                            <Feather name={activeTab === 'posts' ? 'camera' : 'bookmark'} size={48} color={colors.textTertiary} />
                            <Text style={[styles.emptyText, { color: colors.text }]}>
                                {activeTab === 'posts' ? 'No fits yet' : 'No saved posts'}
                            </Text>
                            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                                {activeTab === 'posts' ? 'Create your first fit!' : 'Save posts to see them here'}
                            </Text>
                        </View>
                    }
                    showsVerticalScrollIndicator={false}
                />
            </View>

            {/* Stylist Verification Modal */}
            <StylistModal
                visible={showStylistModal}
                onClose={() => setShowStylistModal(false)}
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
});
