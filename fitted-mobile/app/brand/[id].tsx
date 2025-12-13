import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { searchProducts } from '@/services/aiService';
import { ClothingItem } from '@/types';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const GAP = 12;
const ITEM_WIDTH = (width - 32 - GAP) / COLUMN_COUNT; // 32 for container padding

export default function BrandDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>(); // id is the brand name here
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const [items, setItems] = useState<ClothingItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Normalize brand name
    const brandName = id || 'Brand';

    useEffect(() => {
        fetchBrandItems();
    }, [id]);

    const fetchBrandItems = async () => {
        try {
            setLoading(true);
            // In a real app, fetch from DB. Here we use the search service or mock fallback.
            const results = await searchProducts(`${brandName} clothing`);

            if (results && results.length > 0) {
                const mappedItems: ClothingItem[] = results.map((item: any, index: number) => {
                    // Image fallback logic same as PostDetail
                    let imageUrl = item.imageUrl;
                    if (!imageUrl || imageUrl.length < 10) {
                        const searchTerm = `${item.brand} ${item.name} white background`;
                        imageUrl = `https://tse2.mm.bing.net/th?q=${encodeURIComponent(searchTerm)}&w=500&h=500&c=7&rs=1&p=0`;
                    }

                    return {
                        id: `brand_${index}`,
                        brand: item.brand || brandName,
                        name: item.name,
                        price: item.price || 0,
                        image_url: imageUrl,
                        purchase_link: item.purchaseLink || '',
                    };
                });
                setItems(mappedItems);
            } else {
                // Fallback mock if search fails just to show UI structure
                setItems([
                    { id: '1', brand: brandName, name: 'Logo Tee', price: 76, image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=500', purchase_link: '' },
                    { id: '2', brand: brandName, name: 'Track Shorts', price: 89, image_url: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=500', purchase_link: '' },
                    { id: '3', brand: brandName, name: 'Denim Jacket', price: 120, image_url: 'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?auto=format&fit=crop&q=80&w=500', purchase_link: '' },
                    { id: '4', brand: brandName, name: 'Knit Beanie', price: 45, image_url: 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&q=80&w=500', purchase_link: '' },
                ]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const renderHeader = () => (
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => router.back()} style={styles.iconButton}>
                <Feather name="arrow-left" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {brandName}
            </Text>
            <Pressable style={styles.iconButton}>
                <Feather name="filter" size={24} color={colors.textSecondary} />
            </Pressable>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            {renderHeader()}

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Hero Section */}
                <View style={[styles.heroContainer, { backgroundColor: colors.backgroundSecondary }]}>
                    <Text style={[styles.heroBrandName, { color: colors.text }]}>{brandName}</Text>
                    <Text style={[styles.heroDescription, { color: colors.textSecondary }]}>
                        Discover the latest collection and trending items from {brandName} on Fitted.
                    </Text>
                </View>

                {/* Grid Section */}
                <View style={styles.gridContainer}>
                    <Text style={[styles.itemsCount, { color: colors.textSecondary }]}>
                        {loading ? 'LOADING...' : `${items.length} ITEMS`}
                    </Text>

                    {loading ? (
                        <View style={{ height: 200, justifyContent: 'center' }}>
                            <ActivityIndicator color={colors.text} />
                        </View>
                    ) : (
                        <View style={styles.grid}>
                            {items.map((item) => (
                                <Pressable key={item.id} style={styles.card}>
                                    <View style={[styles.imageContainer, { backgroundColor: colors.backgroundSecondary }]}>
                                        <Image
                                            source={{ uri: item.image_url }}
                                            style={styles.image}
                                            contentFit="cover"
                                        />
                                    </View>
                                    <View style={styles.cardInfo}>
                                        <Text style={[styles.cardBrand, { color: colors.textTertiary }]}>{brandName}</Text>
                                        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                                        <Text style={[styles.cardPrice, { color: colors.textSecondary }]}>${item.price}</Text>
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
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
        paddingTop: 60,
        paddingBottom: 16,
        borderBottomWidth: 1,
        zIndex: 10,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    iconButton: {
        padding: 4,
    },
    heroContainer: {
        padding: 24,
        paddingVertical: 32,
    },
    heroBrandName: {
        fontSize: 32,
        fontWeight: '900',
        marginBottom: 8,
        letterSpacing: -1,
    },
    heroDescription: {
        fontSize: 15,
        lineHeight: 22,
    },
    gridContainer: {
        padding: 16,
    },
    itemsCount: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 16,
        letterSpacing: 0.5,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: GAP,
    },
    card: {
        width: ITEM_WIDTH,
        marginBottom: 20,
    },
    imageContainer: {
        width: ITEM_WIDTH,
        height: ITEM_WIDTH, // Square image
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 12,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    cardInfo: {
        gap: 2,
    },
    cardBrand: {
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    cardName: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    cardPrice: {
        fontSize: 14,
        fontWeight: '400',
    }
});
