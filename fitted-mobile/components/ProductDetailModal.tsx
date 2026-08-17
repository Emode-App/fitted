import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Dimensions, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { Product } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useAuthStore } from '@/stores/authStore';
import { reportContent } from '@/services/moderation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ProductDetailModalProps {
    visible: boolean;
    product: Product | null;
    onClose: () => void;
}

export default function ProductDetailModal({ visible, product, onClose }: ProductDetailModalProps) {
    const { colors, isDark } = useTheme();
    const { addToDressingRoom, sendToCanvas } = useMarketplaceStore();
    const user = useAuthStore((state) => state.user);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [showGoToCanvas, setShowGoToCanvas] = useState(false);
    const [showGoToDressingRoom, setShowGoToDressingRoom] = useState(false);

    if (!product) return null;

    const formatPrice = (price: number) => `$${price.toFixed(2)}`;

    const handleTryOn = () => {
        addToDressingRoom(product);
        setToastMessage('Added to Dressing Room');
        setShowGoToCanvas(false);
        setShowGoToDressingRoom(true);
        setShowToast(true);
        // Don't auto-dismiss, let user choose
    };

    const handleSendToCanvas = () => {
        sendToCanvas(product);
        setToastMessage('Added to Canvas');
        setShowGoToCanvas(true);
        setShowGoToDressingRoom(false);
        setShowToast(true);
        // Don't auto-navigate, let user choose
    };

    const handleGoToCanvas = () => {
        setShowToast(false);
        onClose();
        // Pass product data via URL params so canvas can consume it
        router.push({
            pathname: '/(tabs)/create',
            params: {
                addProductId: product.id,
                addProductUrl: product.image_urls[0],
                addProductName: product.name,
            }
        });
    };

    const handleGoToDressingRoom = () => {
        setShowToast(false);
        onClose();
        // Navigate to profile with params to open dressing room in settings
        router.push({
            pathname: '/(tabs)/profile',
            params: { openSettings: 'true', settingsView: 'dressingRoom' }
        });
    };

    const handleViewSeller = () => {
        if (product.seller) {
            onClose();
            router.push(`/user/${product.seller.id}`);
        }
    };

    const reportProduct = async () => {
        const result = await reportContent({ contentType: 'product', contentId: product.id, reportedUserId: product.seller_id, reason: 'Prohibited or misleading marketplace listing' });
        Alert.alert(result.error ? 'Could Not Report' : 'Report Received', result.error || 'Thank you. The listing was sent to the moderation team.');
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Feather name="x" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Product Details</Text>
                    {product.seller_id !== user?.id ? (
                        <Pressable onPress={reportProduct} style={styles.closeButton} accessibilityLabel="Report product listing">
                            <Feather name="flag" size={20} color={colors.textSecondary} />
                        </Pressable>
                    ) : <View style={{ width: 40 }} />}
                </View>

                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {/* Image Carousel */}
                    <View style={styles.imageContainer}>
                        <Image
                            source={{ uri: product.image_urls[currentImageIndex] }}
                            style={styles.mainImage}
                            contentFit="cover"
                        />
                        {product.image_urls.length > 1 && (
                            <View style={styles.imageDots}>
                                {product.image_urls.map((_, index) => (
                                    <Pressable
                                        key={index}
                                        onPress={() => setCurrentImageIndex(index)}
                                        style={[
                                            styles.dot,
                                            index === currentImageIndex && styles.dotActive
                                        ]}
                                    />
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Product Info */}
                    <View style={styles.infoSection}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.productName, { color: colors.text }]}>{product.name}</Text>
                            <Text style={[styles.price, { color: colors.primary }]}>{formatPrice(product.price)}</Text>
                        </View>

                        {/* Seller */}
                        <Pressable style={styles.sellerRow} onPress={handleViewSeller}>
                            {product.seller && (
                                <>
                                    <Image
                                        source={{ uri: product.seller.avatar_url }}
                                        style={styles.sellerAvatar}
                                    />
                                    <Text style={[styles.sellerHandle, { color: colors.textSecondary }]}>
                                        {product.seller.handle?.startsWith('@') ? product.seller.handle : `@${product.seller.handle}`}
                                    </Text>
                                    {product.seller.is_verified_boutique && (
                                        <Ionicons name="shield-checkmark" size={16} color="#22c55e" />
                                    )}
                                </>
                            )}
                        </Pressable>

                        {/* Sizes */}
                        {product.sizes.length > 0 && (
                            <View style={styles.sizesSection}>
                                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>SIZES</Text>
                                <View style={styles.sizesRow}>
                                    {product.sizes.map((size) => (
                                        <View key={size} style={[styles.sizeChip, { backgroundColor: colors.backgroundSecondary }]}>
                                            <Text style={[styles.sizeText, { color: colors.text }]}>{size}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Description */}
                        {product.description && (
                            <View style={styles.descriptionSection}>
                                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>DESCRIPTION</Text>
                                <Text style={[styles.description, { color: colors.text }]}>{product.description}</Text>
                            </View>
                        )}

                        {/* Tags */}
                        {product.tags && product.tags.length > 0 && (
                            <View style={styles.tagsSection}>
                                <View style={styles.tagsRow}>
                                    {product.tags.map((tag) => (
                                        <View key={tag} style={[styles.tagChip, { backgroundColor: colors.primary + '20' }]}>
                                            <Text style={[styles.tagText, { color: colors.primary }]}>#{tag}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                </ScrollView>

                {/* Action Buttons */}
                <View style={[styles.actionBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    <Pressable
                        style={[styles.actionButton, styles.tryOnButton, { borderColor: colors.primary }]}
                        onPress={handleTryOn}
                    >
                        <Feather name="shopping-bag" size={20} color={colors.primary} />
                        <Text style={[styles.actionButtonText, { color: colors.primary }]}>Try On?</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.actionButton, styles.canvasButton, { backgroundColor: colors.primary }]}
                        onPress={handleSendToCanvas}
                    >
                        <Feather name="plus-square" size={20} color="#fff" />
                        <Text style={[styles.actionButtonText, { color: '#fff' }]}>Send to Canvas</Text>
                    </Pressable>
                </View>

                {/* Toast Notification */}
                {showToast && (
                    <View style={styles.toastContainer}>
                        <BlurView intensity={80} style={styles.toast} tint={isDark ? 'dark' : 'light'}>
                            <Feather name="check-circle" size={20} color="#22c55e" />
                            <Text style={[styles.toastText, { color: colors.text }]}>{toastMessage}</Text>
                            {showGoToCanvas && (
                                <Pressable
                                    style={[styles.toastButton, { backgroundColor: colors.primary }]}
                                    onPress={handleGoToCanvas}
                                >
                                    <Text style={styles.toastButtonText}>Go to Canvas</Text>
                                </Pressable>
                            )}
                            {showGoToDressingRoom && (
                                <Pressable
                                    style={[styles.toastButton, { backgroundColor: '#9333EA' }]}
                                    onPress={handleGoToDressingRoom}
                                >
                                    <Text style={styles.toastButtonText}>Go to Dressing Room</Text>
                                </Pressable>
                            )}
                        </BlurView>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
    content: {
        flex: 1,
    },
    imageContainer: {
        width: SCREEN_WIDTH,
        height: SCREEN_WIDTH,
        backgroundColor: '#f3f4f6',
    },
    mainImage: {
        width: '100%',
        height: '100%',
    },
    imageDots: {
        position: 'absolute',
        bottom: 16,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.5)',
    },
    dotActive: {
        backgroundColor: '#fff',
    },
    infoSection: {
        padding: 16,
        gap: 16,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    productName: {
        fontSize: 22,
        fontWeight: '700',
        flex: 1,
        marginRight: 12,
    },
    price: {
        fontSize: 22,
        fontWeight: '800',
    },
    sellerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sellerAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#e5e7eb',
    },
    sellerHandle: {
        fontSize: 15,
        fontWeight: '500',
    },
    sizesSection: {
        gap: 8,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    sizesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    sizeChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    sizeText: {
        fontSize: 14,
        fontWeight: '600',
    },
    descriptionSection: {
        gap: 8,
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
    },
    tagsSection: {
        gap: 8,
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tagChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    tagText: {
        fontSize: 13,
        fontWeight: '600',
    },
    actionBar: {
        flexDirection: 'row',
        padding: 16,
        paddingBottom: 32,
        gap: 12,
        borderTopWidth: 1,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    tryOnButton: {
        borderWidth: 2,
    },
    canvasButton: {},
    actionButtonText: {
        fontSize: 16,
        fontWeight: '700',
    },
    toastContainer: {
        position: 'absolute',
        bottom: 100,
        left: 16,
        right: 16,
        alignItems: 'center',
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 10,
        overflow: 'hidden',
    },
    toastText: {
        fontSize: 15,
        fontWeight: '600',
    },
    toastButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        marginLeft: 8,
    },
    toastButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
});
