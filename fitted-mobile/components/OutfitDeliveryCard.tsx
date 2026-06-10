import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    Dimensions,
    Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/hooks/useTheme';
import { StylingDelivery, ClothingItem } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OutfitDeliveryCardProps {
    delivery: StylingDelivery;
    isOwnMessage: boolean; // did the stylist (sender) send this?
    timestamp: string;
    onSaveToProfile?: () => void;
}

export default function OutfitDeliveryCard({ delivery, isOwnMessage, timestamp, onSaveToProfile }: OutfitDeliveryCardProps) {
    const { colors, isDark } = useTheme();
    const [showFullscreen, setShowFullscreen] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

    const formatTime = (ts: string): string => {
        const date = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'now';
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        return date.toLocaleDateString();
    };

    const openFullscreen = (url: string) => {
        setFullscreenImage(url);
        setShowFullscreen(true);
    };

    return (
        <>
            <View style={[
                styles.container,
                { alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' }
            ]}>
                <View style={[
                    styles.card,
                    {
                        backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                        borderColor: isDark ? '#2d2d5e' : '#e0e7ff',
                        shadowColor: '#6366f1',
                    }
                ]}>
                    {/* Header */}
                    <View style={styles.headerRow}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                            <MaterialCommunityIcons name="palette" size={18} color="#6366f1" />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={[styles.headerLabel, { color: colors.text }]}>
                                {isOwnMessage ? 'Outfit Delivered' : 'Your Styled Outfit'}
                            </Text>
                            <Text style={[styles.headerSub, { color: colors.textTertiary }]}>
                                {delivery.items.length} item{delivery.items.length !== 1 ? 's' : ''} styled
                            </Text>
                        </View>
                        <View style={[styles.deliveredBadge, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                            <Feather name="check-circle" size={11} color="#6366f1" />
                            <Text style={[styles.deliveredText, { color: '#6366f1' }]}>Delivered</Text>
                        </View>
                    </View>

                    {/* Generated Outfit Image */}
                    <Pressable onPress={() => openFullscreen(delivery.generated_image_url)}>
                        <View style={styles.outfitImageContainer}>
                            <Image
                                source={{ uri: delivery.generated_image_url }}
                                style={styles.outfitImage}
                                contentFit="cover"
                                transition={300}
                            />
                            {/* Tap to expand overlay */}
                            <View style={styles.expandOverlay}>
                                <Feather name="maximize-2" size={16} color="rgba(255,255,255,0.9)" />
                            </View>
                        </View>
                    </Pressable>

                    {/* Board Image (if available) */}
                    {delivery.board_image_url && (
                        <Pressable onPress={() => openFullscreen(delivery.board_image_url!)} style={{ marginTop: 8 }}>
                            <View style={styles.boardImageContainer}>
                                <Image
                                    source={{ uri: delivery.board_image_url }}
                                    style={styles.boardImage}
                                    contentFit="cover"
                                    transition={300}
                                />
                                <View style={styles.boardLabel}>
                                    <Text style={styles.boardLabelText}>Moodboard</Text>
                                </View>
                            </View>
                        </Pressable>
                    )}

                    {/* Caption */}
                    {delivery.caption ? (
                        <Text style={[styles.caption, { color: colors.textSecondary }]}>
                            {delivery.caption}
                        </Text>
                    ) : null}

                    {/* Tagged Items */}
                    {delivery.items.length > 0 && (
                        <View style={styles.itemsSection}>
                            <Text style={[styles.itemsSectionTitle, { color: colors.textTertiary }]}>
                                TAGGED ITEMS
                            </Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.itemsScroll}
                            >
                                {delivery.items.map((item, index) => (
                                    <View
                                        key={item.id || index.toString()}
                                        style={[styles.itemCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}
                                    >
                                        {item.image_url ? (
                                            <Image
                                                source={{ uri: item.image_url }}
                                                style={styles.itemImage}
                                                contentFit="cover"
                                            />
                                        ) : (
                                            <View style={[styles.itemImagePlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                                                <Feather name="image" size={16} color={colors.textTertiary} />
                                            </View>
                                        )}
                                        <Text style={[styles.itemBrand, { color: colors.textTertiary }]} numberOfLines={1}>
                                            {item.brand || 'Brand'}
                                        </Text>
                                        <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                                            {item.name || 'Item'}
                                        </Text>
                                        {item.price > 0 && (
                                            <Text style={[styles.itemPrice, { color: '#6366f1' }]}>
                                                ${item.price.toFixed(0)}
                                            </Text>
                                        )}
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Action Buttons — client side */}
                    {!isOwnMessage && onSaveToProfile && (
                        <Pressable style={styles.saveButtonWrapper} onPress={onSaveToProfile}>
                            <LinearGradient
                                colors={['#6366f1', '#4f46e5']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.saveButton}
                            >
                                <Feather name="download" size={15} color="#fff" />
                                <Text style={styles.saveButtonText}>Save to Profile</Text>
                            </LinearGradient>
                        </Pressable>
                    )}

                    {/* Timestamp */}
                    <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
                        {formatTime(timestamp)}
                    </Text>
                </View>
            </View>

            {/* Fullscreen Image Modal */}
            <Modal
                visible={showFullscreen}
                transparent
                animationType="fade"
                onRequestClose={() => setShowFullscreen(false)}
            >
                <Pressable style={styles.fullscreenOverlay} onPress={() => setShowFullscreen(false)}>
                    <BlurView intensity={40} style={StyleSheet.absoluteFill} tint="dark" />
                    <Pressable style={styles.fullscreenClose} onPress={() => setShowFullscreen(false)}>
                        <Feather name="x" size={24} color="#fff" />
                    </Pressable>
                    {fullscreenImage && (
                        <Image
                            source={{ uri: fullscreenImage }}
                            style={styles.fullscreenImage}
                            contentFit="contain"
                        />
                    )}
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        maxWidth: '90%',
        marginBottom: 10,
    },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 14,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
    },
    // Header
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    iconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: {
        flex: 1,
        marginLeft: 10,
    },
    headerLabel: {
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    headerSub: {
        fontSize: 11,
        fontFamily: 'Inter_400Regular',
        marginTop: 1,
    },
    deliveredBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        gap: 4,
    },
    deliveredText: {
        fontSize: 11,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    // Outfit Image
    outfitImageContainer: {
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
    },
    outfitImage: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 14,
    },
    expandOverlay: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Board Image
    boardImageContainer: {
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
        height: 80,
    },
    boardImage: {
        width: '100%',
        height: '100%',
    },
    boardLabel: {
        position: 'absolute',
        bottom: 6,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    boardLabelText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    // Caption
    caption: {
        fontSize: 13,
        lineHeight: 18,
        marginTop: 10,
        fontFamily: 'Inter_500Medium',
    },
    // Items
    itemsSection: {
        marginTop: 12,
    },
    itemsSectionTitle: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 8,
        fontFamily: 'Inter_700Bold',
    },
    itemsScroll: {
        gap: 8,
        paddingRight: 4,
    },
    itemCard: {
        width: 100,
        borderRadius: 10,
        padding: 8,
        alignItems: 'center',
    },
    itemImage: {
        width: 60,
        height: 60,
        borderRadius: 8,
        marginBottom: 6,
    },
    itemImagePlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 8,
        marginBottom: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemBrand: {
        fontSize: 9,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        fontFamily: 'Inter_700Bold',
    },
    itemName: {
        fontSize: 11,
        fontWeight: '500',
        fontFamily: 'Inter_500Medium',
        textAlign: 'center',
    },
    itemPrice: {
        fontSize: 12,
        fontWeight: '800',
        fontFamily: 'Inter_900Black',
        marginTop: 2,
    },
    // Save Button
    saveButtonWrapper: {
        marginTop: 12,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: 12,
        gap: 6,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    // Timestamp
    timestamp: {
        fontSize: 10,
        marginTop: 8,
        alignSelf: 'flex-end',
        fontFamily: 'Inter_400Regular',
    },
    // Fullscreen
    fullscreenOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullscreenClose: {
        position: 'absolute',
        top: 60,
        right: 20,
        zIndex: 10,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullscreenImage: {
        width: SCREEN_WIDTH - 32,
        height: SCREEN_WIDTH - 32,
        borderRadius: 16,
    },
});
