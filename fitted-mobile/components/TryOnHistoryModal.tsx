import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Modal,
    FlatList,
    ActivityIndicator,
    Alert,
    Dimensions,
    ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useMarketplaceStore, type TryOnHistoryEntry } from '@/stores/marketplaceStore';
import { Product } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 12;
const TILE_SIZE = (SCREEN_WIDTH - 32 - GRID_GAP) / 2;

interface TryOnHistoryModalProps {
    visible: boolean;
    onClose: () => void;
    /** Called after a past fit is put back on the rack, so the caller can show it. */
    onReopened?: () => void;
}

function formatWhen(iso: string): string {
    const then = new Date(iso);
    const days = Math.floor((Date.now() - then.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function TryOnHistoryModal({ visible, onClose, onReopened }: TryOnHistoryModalProps) {
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);
    const {
        tryOnHistory,
        isLoadingHistory,
        fetchTryOnHistory,
        reopenTryOn,
        deleteTryOn,
        addToCart,
        cartItems,
    } = useMarketplaceStore();

    // Which fit is open, by id rather than by object, so it survives the list
    // being refetched underneath it.
    const [openId, setOpenId] = useState<string | null>(null);
    const open = tryOnHistory.find(e => e.id === openId) || null;

    useEffect(() => {
        if (visible && user?.id) fetchTryOnHistory(user.id);
        if (!visible) setOpenId(null);
    }, [visible, user?.id, fetchTryOnHistory]);

    const isInCart = (productId: string) => cartItems.some(c => c.id === productId);

    const handleAddToCart = async (product: Product) => {
        if (!user?.id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await addToCart(product, user.id);
        Alert.alert('Added to Cart', `${product.name} has been added to your cart.`);
    };

    const handleReopen = (entry: TryOnHistoryEntry) => {
        if (entry.products.length === 0) {
            Alert.alert(
                'Nothing left to open',
                'Every piece in this fit has since been taken down by its seller.',
            );
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        reopenTryOn(entry);
        onClose();
        onReopened?.();
    };

    const handleDelete = (entry: TryOnHistoryEntry) => {
        Alert.alert(
            'Delete this try-on?',
            'The image will be removed for good. The pieces stay in the shop.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setOpenId(null);
                        const ok = await deleteTryOn(entry.id);
                        if (!ok) Alert.alert('Could Not Delete', 'Something went wrong. Try again.');
                    },
                },
            ],
        );
    };

    // ─────────────────────────────────────────────── one fit, opened up ────

    const renderDetail = (entry: TryOnHistoryEntry) => {
        const missing = entry.productIds.length - entry.products.length;

        return (
            <ScrollView contentContainerStyle={styles.detailScroll}>
                <View style={[styles.detailImageWrap, { backgroundColor: colors.backgroundSecondary }]}>
                    {entry.imageUrl ? (
                        <Image source={{ uri: entry.imageUrl }} style={styles.detailImage} contentFit="cover" />
                    ) : (
                        <View style={styles.detailPlaceholder}>
                            <Feather name="image" size={40} color={colors.textSecondary} />
                            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                                This image is no longer available
                            </Text>
                        </View>
                    )}
                </View>

                <Text style={[styles.detailWhen, { color: colors.textSecondary }]}>
                    {formatWhen(entry.createdAt)} · {entry.productIds.length} piece
                    {entry.productIds.length !== 1 ? 's' : ''}
                </Text>

                <Pressable
                    style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                    onPress={() => handleReopen(entry)}
                >
                    <Feather name="refresh-ccw" size={16} color={colors.primaryForeground} />
                    <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                        Open in Dressing Room
                    </Text>
                </Pressable>

                <Text style={[styles.sectionTitle, { color: colors.text }]}>In this fit</Text>

                {entry.products.map((product) => {
                    const inCart = isInCart(product.id);
                    return (
                        <View
                            key={product.id}
                            style={[styles.pieceRow, { backgroundColor: colors.backgroundSecondary }]}
                        >
                            <Image
                                source={{ uri: product.image_urls[0] }}
                                style={styles.pieceImage}
                                contentFit="cover"
                            />
                            <View style={styles.pieceInfo}>
                                <Text style={[styles.pieceName, { color: colors.text }]} numberOfLines={1}>
                                    {product.name}
                                </Text>
                                <Text style={[styles.piecePrice, { color: colors.primary }]}>
                                    ${product.price.toFixed(2)}
                                </Text>
                            </View>
                            <Pressable
                                style={[
                                    styles.pieceCart,
                                    inCart
                                        ? { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                                        : { backgroundColor: colors.background, borderColor: colors.border },
                                ]}
                                onPress={() => handleAddToCart(product)}
                                disabled={inCart}
                            >
                                <Feather
                                    name={inCart ? 'check' : 'shopping-cart'}
                                    size={14}
                                    color={inCart ? colors.primary : colors.text}
                                />
                                <Text
                                    style={[styles.pieceCartText, { color: inCart ? colors.primary : colors.text }]}
                                >
                                    {inCart ? 'In Cart' : 'Add'}
                                </Text>
                            </Pressable>
                        </View>
                    );
                })}

                {missing > 0 && (
                    <Text style={[styles.missingNote, { color: colors.textSecondary }]}>
                        {missing} piece{missing !== 1 ? 's are' : ' is'} no longer for sale.
                    </Text>
                )}

                <Pressable style={styles.deleteButton} onPress={() => handleDelete(entry)}>
                    <Feather name="trash-2" size={15} color={colors.error || '#ef4444'} />
                    <Text style={[styles.deleteButtonText, { color: colors.error || '#ef4444' }]}>
                        Delete this try-on
                    </Text>
                </Pressable>
            </ScrollView>
        );
    };

    // ──────────────────────────────────────────────────────── the grid ────

    const renderTile = ({ item }: { item: TryOnHistoryEntry }) => (
        <Pressable
            style={[styles.tile, { backgroundColor: colors.backgroundSecondary }]}
            onPress={() => setOpenId(item.id)}
        >
            {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.tileImage} contentFit="cover" />
            ) : (
                <View style={styles.tilePlaceholder}>
                    <Feather name="image" size={24} color={colors.textSecondary} />
                </View>
            )}
            <View style={styles.tileFooter}>
                <Text style={[styles.tileWhen, { color: colors.textSecondary }]} numberOfLines={1}>
                    {formatWhen(item.createdAt)}
                </Text>
                <Text style={[styles.tileCount, { color: colors.textSecondary }]}>
                    {item.productIds.length}
                </Text>
            </View>
        </Pressable>
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <Pressable
                        onPress={() => (open ? setOpenId(null) : onClose())}
                        style={styles.headerButton}
                        accessibilityLabel={open ? 'Back to history' : 'Close history'}
                    >
                        <Feather name={open ? 'arrow-left' : 'x'} size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>
                        {open ? 'Past Try-On' : 'Try-On History'}
                    </Text>
                    <View style={styles.headerButton} />
                </View>

                {open ? (
                    renderDetail(open)
                ) : isLoadingHistory && tryOnHistory.length === 0 ? (
                    <View style={styles.centered}>
                        <ActivityIndicator color={colors.primary} />
                    </View>
                ) : tryOnHistory.length === 0 ? (
                    <View style={styles.centered}>
                        <Feather name="clock" size={44} color={colors.textSecondary} />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>No try-ons yet</Text>
                        <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                            Every fit you generate lands here. Open one back up to wear it again or
                            buy the pieces.
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={tryOnHistory}
                        keyExtractor={(item) => item.id}
                        renderItem={renderTile}
                        numColumns={2}
                        columnWrapperStyle={{ gap: GRID_GAP }}
                        contentContainerStyle={styles.grid}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerButton: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '700' },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 6 },
    emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

    grid: { padding: 16, gap: GRID_GAP },
    tile: { width: TILE_SIZE, borderRadius: 14, overflow: 'hidden' },
    tileImage: { width: TILE_SIZE, height: TILE_SIZE * 1.25 },
    tilePlaceholder: {
        width: TILE_SIZE,
        height: TILE_SIZE * 1.25,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tileFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    tileWhen: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
    tileCount: { fontSize: 12, fontWeight: '700' },

    detailScroll: { padding: 16, paddingBottom: 40 },
    detailImageWrap: { borderRadius: 16, overflow: 'hidden' },
    detailImage: { width: '100%', aspectRatio: 0.8 },
    detailPlaceholder: { width: '100%', aspectRatio: 0.8, alignItems: 'center', justifyContent: 'center', gap: 10 },
    placeholderText: { fontSize: 13 },
    detailWhen: { fontSize: 13, fontWeight: '600', marginTop: 12 },

    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 14,
        marginTop: 14,
    },
    primaryButtonText: { fontSize: 15, fontWeight: '700' },

    sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 24, marginBottom: 10 },
    pieceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        borderRadius: 12,
        marginBottom: 8,
    },
    pieceImage: { width: 52, height: 52, borderRadius: 8 },
    pieceInfo: { flex: 1, gap: 3 },
    pieceName: { fontSize: 14, fontWeight: '600' },
    piecePrice: { fontSize: 13, fontWeight: '700' },
    pieceCart: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    pieceCartText: { fontSize: 12, fontWeight: '700' },

    missingNote: { fontSize: 12, marginTop: 4 },

    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        marginTop: 28,
        paddingVertical: 12,
    },
    deleteButtonText: { fontSize: 14, fontWeight: '600' },
});
