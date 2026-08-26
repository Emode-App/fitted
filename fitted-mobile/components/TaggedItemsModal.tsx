import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, Text, Linking, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { ClothingItem } from '@/types';
import SaveItemButton from '@/components/SaveItemButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SHEET_WIDTH = Math.min(SCREEN_WIDTH - 40, 380);

interface TaggedItemsModalProps {
    visible: boolean;
    items: ClothingItem[];
    initialIndex: number;
    onClose: () => void;
    postId?: string;
}

/**
 * The pieces in a look, one per page, swipeable.
 *
 * Tapping a tagged item in a delivery did nothing at all -- the row was
 * decoration. Opening one item alone would have been the obvious fix and the
 * wrong one: the reason to look at a piece is usually to compare it with the
 * others in the same outfit, and going back out to the card between each is
 * the friction that stops people doing it.
 */
export default function TaggedItemsModal({
    visible,
    items,
    initialIndex,
    onClose,
    postId,
}: TaggedItemsModalProps) {
    const { colors } = useTheme();
    const scrollRef = useRef<ScrollView>(null);
    const [index, setIndex] = useState(initialIndex);

    // Open on the piece that was tapped, not on the first one.
    useEffect(() => {
        if (!visible) return;
        setIndex(initialIndex);
        // Without the frame the ScrollView has not laid out yet and the offset
        // is applied to nothing.
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ x: initialIndex * SHEET_WIDTH, animated: false });
        });
    }, [visible, initialIndex]);

    if (!items.length) return null;

    const openLink = async (url: string) => {
        const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        try { await Linking.openURL(full); } catch { /* a dead link is not worth a crash */ }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                {/* The backdrop is a sibling behind the sheet, not a wrapper
                    around it.
                    
                    Wrapping meant a Pressable ancestor sat directly above the
                    pager, and a pressable competes for the touch responder as
                    soon as a drag starts -- so the dots were there and swiping
                    did nothing. As a sibling it still closes on a tap outside,
                    because a tap on the sheet never reaches it. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <View style={[styles.sheet, { backgroundColor: colors.background }]}>
                    <ScrollView
                        ref={scrollRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(event) => {
                            setIndex(Math.round(event.nativeEvent.contentOffset.x / SHEET_WIDTH));
                        }}
                    >
                        {items.map((item) => (
                            <View key={item.id} style={[styles.page, { width: SHEET_WIDTH }]}>
                                <View style={styles.imageWrap}>
                                    {item.image_url ? (
                                        <Image source={{ uri: item.image_url }} style={styles.image} contentFit="contain" />
                                    ) : (
                                        <View style={[styles.image, styles.imageMissing, { backgroundColor: colors.backgroundSecondary }]}>
                                            <Feather name="image" size={22} color={colors.textTertiary} />
                                        </View>
                                    )}
                                    <View style={styles.saveButton}>
                                        {/* SaveItemButton takes a SaveableItem,
                                            which is a different shape from a
                                            ClothingItem -- mapped the same way
                                            PostItem does it. */}
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
                                    </View>
                                </View>

                                <Text style={[styles.brand, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {item.brand || 'Brand'}
                                </Text>
                                {/* The full name, not the truncated one from the
                                    card -- seeing it in full is half the reason
                                    for opening this. */}
                                <Text style={[styles.name, { color: colors.text }]}>
                                    {item.name || 'Item'}
                                </Text>

                                <Text style={[styles.price, { color: item.price > 0 ? colors.primary : colors.textTertiary }]}>
                                    {item.price > 0 ? `$${item.price}` : 'Price not listed'}
                                </Text>

                                {item.purchase_link ? (
                                    <Pressable
                                        style={[styles.linkButton, { backgroundColor: colors.primary }]}
                                        onPress={() => openLink(item.purchase_link)}
                                    >
                                        <Feather name="external-link" size={15} color={colors.primaryForeground} />
                                        <Text style={[styles.linkText, { color: colors.primaryForeground }]}>View item</Text>
                                    </Pressable>
                                ) : (
                                    <Text style={[styles.noLink, { color: colors.textTertiary }]}>No link on this piece</Text>
                                )}
                            </View>
                        ))}
                    </ScrollView>

                    {items.length > 1 && (
                        <View style={styles.dots}>
                            {items.map((item, i) => (
                                <View
                                    key={item.id}
                                    style={[styles.dot, { backgroundColor: i === index ? colors.primary : colors.border }]}
                                />
                            ))}
                        </View>
                    )}

                    <Pressable style={styles.close} onPress={onClose}>
                        <Text style={[styles.closeText, { color: colors.textTertiary }]}>Close</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    sheet: {
        width: SHEET_WIDTH,
        borderRadius: 20,
        paddingTop: 18,
        paddingBottom: 8,
        overflow: 'hidden',
    },
    page: {
        paddingHorizontal: 18,
        alignItems: 'center',
    },
    imageWrap: {
        width: '100%',
        height: 200,
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
        borderRadius: 12,
    },
    imageMissing: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButton: {
        position: 'absolute',
        top: 6,
        right: 6,
    },
    brand: {
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginTop: 14,
        alignSelf: 'flex-start',
    },
    name: {
        fontSize: 17,
        fontWeight: '700',
        marginTop: 3,
        alignSelf: 'flex-start',
    },
    price: {
        fontSize: 16,
        fontWeight: '700',
        marginTop: 8,
        alignSelf: 'flex-start',
    },
    linkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        alignSelf: 'stretch',
        paddingVertical: 13,
        borderRadius: 14,
        marginTop: 16,
    },
    linkText: {
        fontSize: 15,
        fontWeight: '700',
    },
    noLink: {
        fontSize: 13,
        marginTop: 18,
        alignSelf: 'flex-start',
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginTop: 16,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    close: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    closeText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
