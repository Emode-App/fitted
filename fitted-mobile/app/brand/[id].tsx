import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/services/supabase';
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

    // What people actually wore and tagged, not a live catalogue lookup.
    //
    // This used to proxy a sneaker API for "<brand> clothing", which returned
    // poor matches for apparel at the best of times and nothing at all whenever
    // that upstream was down -- which is what emptied every brand page. The
    // brands tagged on real posts are the inventory this app genuinely has.
    const fetchBrandItems = async () => {
        try {
            setLoading(true);

            const { data, error } = await supabase
                .from('brand_items')
                .select('brand_name, name, image_url, product_url, price, is_tagged')
                // Pieces somebody here actually wore rank above catalogue listings.
                .ilike('brand_name', brandName)
                .order('is_tagged', { ascending: false })
                .order('sort_at', { ascending: false })
                .limit(60);

            if (error) throw error;

            // The same piece can appear in several posts; show it once.
            const seen = new Set<string>();
            const mapped: ClothingItem[] = [];

            for (const row of data ?? []) {
                const key = (row.name ?? '').toLowerCase();
                if (!key || seen.has(key)) continue;
                seen.add(key);

                mapped.push({
                    id: `brand_${mapped.length}`,
                    brand: row.brand_name || brandName,
                    name: row.name || 'Item',
                    price: Number(row.price) || 0,
                    image_url: row.image_url || '',
                    purchase_link: row.product_url || '',
                });
            }

            setItems(mapped);
        } catch (e) {
            console.error('[brand] could not load tagged items:', e);
            setItems([]);
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
                        Discover the latest collection and trending items from {brandName} on Emode.
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
                    ) : items.length > 0 ? (
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
                    ) : (
                        <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 40 }}>
                            Nobody has tagged a {brandName} piece yet.
                        </Text>
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
