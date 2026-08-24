import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, Dimensions, ActivityIndicator, Alert, Linking } from 'react-native';
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

// The page used to load a flat 60 and stop, so a brand with 328 listings showed
// 60 of them and looked capped for no stated reason.
const PAGE_SIZE = 40;

/** A listing carries whether somebody here actually wore it, which is worth filtering on. */
interface BrandItem extends ClothingItem {
    isTagged: boolean;
}

type SortMode = 'featured' | 'worn' | 'price-asc' | 'price-desc';

const SORTS: { id: SortMode; label: string }[] = [
    { id: 'featured', label: 'Featured' },
    { id: 'worn', label: 'Worn on Emode' },
    { id: 'price-asc', label: 'Price: low to high' },
    { id: 'price-desc', label: 'Price: high to low' },
];

export default function BrandDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>(); // id is the brand name here
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const [items, setItems] = useState<BrandItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState<SortMode>('featured');
    const [showSort, setShowSort] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [exhausted, setExhausted] = useState(false);

    // Normalize brand name
    const brandName = id || 'Brand';

    useEffect(() => {
        // A new brand or a new sort starts the list over.
        setExhausted(false);
        fetchBrandItems(0);
    }, [id, sort]);

    // What people actually wore and tagged, not a live catalogue lookup.
    //
    // This used to proxy a sneaker API for "<brand> clothing", which returned
    // poor matches for apparel at the best of times and nothing at all whenever
    // that upstream was down -- which is what emptied every brand page. The
    // brands tagged on real posts are the inventory this app genuinely has.
    const fetchBrandItems = async (offset: number) => {
        try {
            if (offset === 0) setLoading(true); else setLoadingMore(true);

            // Sorting happens in the query, not on the result.
            //
            // A brand can have hundreds of listings against a page that loads 60,
            // so re-ordering what already arrived would sort 60 of 328 and label
            // it "price: low to high" -- the cheapest of an arbitrary slice, not
            // the cheapest Loewe pieces.
            let query = supabase
                .from('brand_items')
                .select('brand_name, name, image_url, product_url, price, is_tagged')
                .ilike('brand_name', brandName);

            if (sort === 'worn') {
                query = query.eq('is_tagged', true).order('sort_at', { ascending: false });
            } else if (sort === 'price-asc') {
                query = query.order('price', { ascending: true, nullsFirst: false });
            } else if (sort === 'price-desc') {
                query = query.order('price', { ascending: false, nullsFirst: false });
            } else {
                // Pieces somebody here actually wore rank above catalogue listings.
                query = query
                    .order('is_tagged', { ascending: false })
                    .order('sort_at', { ascending: false });
            }

            const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);

            if (error) throw error;

            // A short page means the catalogue is spent; stop asking for more.
            if ((data?.length ?? 0) < PAGE_SIZE) setExhausted(true);

            // The same piece can appear in several posts; show it once. The set
            // carries what is already on screen so a later page cannot re-add a
            // piece an earlier one displayed.
            const existing = offset === 0 ? [] : items;
            const seen = new Set(existing.map((item) => item.name.toLowerCase()));
            const mapped: BrandItem[] = [];

            for (const row of data ?? []) {
                const key = (row.name ?? '').toLowerCase();
                if (!key || seen.has(key)) continue;
                seen.add(key);

                mapped.push({
                    id: `brand_${offset}_${mapped.length}`,
                    brand: row.brand_name || brandName,
                    name: row.name || 'Item',
                    price: Number(row.price) || 0,
                    image_url: row.image_url || '',
                    purchase_link: row.product_url || '',
                    isTagged: !!row.is_tagged,
                });
            }

            setItems(offset === 0 ? mapped : [...existing, ...mapped]);

            // Nothing to show yet: ask for this brand to be crawled.
            //
            // The directory carries ~12,400 brands but deliberately gives none of
            // them a crawl job up front -- that would be years of queue, nearly
            // all of it for labels nobody opens. A brand earns its job the first
            // time somebody actually wants it, which is here and on tagging.
            // Fire-and-forget: the catalogue arrives on a later scheduled run, so
            // there is nothing to wait for and a failure must not blank the page.
            if (offset === 0 && mapped.length === 0) {
                supabase
                    .rpc('ensure_brand_sources_by_name', { brand_name: brandName })
                    .then(({ error: rpcError }) => {
                        if (rpcError) console.warn('[brand] could not queue crawl:', rpcError.message);
                    });
            }
        } catch (e) {
            console.error('[brand] could not load tagged items:', e);
            if (offset === 0) setItems([]);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    /** Pull the next page when the grid runs out. */
    const handleEndReached = () => {
        if (loading || loadingMore || exhausted || items.length === 0) return;
        fetchBrandItems(items.length);
    };

    /** Open the listing on the retailer it came from. */
    const handleOpenItem = async (item: BrandItem) => {
        // Catalogue rows always carry their own link. A piece tagged on a post
        // only has one if whoever tagged it typed one, so fall back to a search
        // rather than leaving the card dead.
        const link = item.purchase_link
            || `https://www.google.com/search?q=${encodeURIComponent([item.brand, item.name].filter(Boolean).join(' '))}`;

        try {
            if (await Linking.canOpenURL(link)) {
                await Linking.openURL(link);
            } else {
                Alert.alert('Cannot Open Link', 'Unable to open this URL on your device.');
            }
        } catch (error) {
            console.error('[brand] could not open listing:', error);
            Alert.alert('Error', 'Failed to open the link.');
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
            <Pressable style={styles.iconButton} onPress={() => setShowSort((open) => !open)}>
                <Feather
                    name="filter"
                    size={24}
                    color={sort === 'featured' ? colors.textSecondary : colors.text}
                />
            </Pressable>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            {renderHeader()}

            {showSort && (
                <View style={[styles.sortSheet, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                    {SORTS.map((option) => (
                        <Pressable
                            key={option.id}
                            style={styles.sortRow}
                            onPress={() => { setSort(option.id); setShowSort(false); }}
                        >
                            <Text style={[styles.sortLabel, { color: sort === option.id ? colors.text : colors.textSecondary }]}>
                                {option.label}
                            </Text>
                            {sort === option.id && <Feather name="check" size={16} color={colors.text} />}
                        </Pressable>
                    ))}
                </View>
            )}

            <FlatList
                data={loading ? [] : items}
                keyExtractor={(item) => item.id}
                numColumns={COLUMN_COUNT}
                // Padding lives on the rows, not the container, so the hero stays
                // full-bleed while the grid keeps the inset ITEM_WIDTH assumes.
                columnWrapperStyle={{ gap: GAP, paddingHorizontal: 16 }}
                contentContainerStyle={{ paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                // A FlatList rather than a ScrollView so the grid can ask for
                // more when it runs out. Items are also only mounted as they
                // come into view, which matters for a brand with hundreds.
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.6}
                ListHeaderComponent={
                    <>
                        <View style={[styles.heroContainer, { backgroundColor: colors.backgroundSecondary }]}>
                            <Text style={[styles.heroBrandName, { color: colors.text }]}>{brandName}</Text>
                            <Text style={[styles.heroDescription, { color: colors.textSecondary }]}>
                                Discover the latest collection and trending items from {brandName} on Emode.
                            </Text>
                        </View>
                        <Text style={[styles.itemsCount, { color: colors.textSecondary, paddingHorizontal: 16 }]}>
                            {loading ? 'LOADING...' : `${items.length}${exhausted ? '' : '+'} ITEMS`}
                        </Text>
                    </>
                }
                renderItem={({ item }) => (
                    <Pressable
                        style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]}
                        onPress={() => handleOpenItem(item)}
                    >
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
                            <Text style={[styles.cardPrice, { color: colors.textSecondary }]}>
                                {item.price > 0 ? `$${item.price}` : 'View item'}
                            </Text>
                        </View>
                    </Pressable>
                )}
                ListEmptyComponent={
                    loading ? (
                        <View style={{ height: 200, justifyContent: 'center' }}>
                            <ActivityIndicator color={colors.text} />
                        </View>
                    ) : (
                        <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 40 }}>
                            {sort === 'worn'
                                ? `Nobody has tagged a ${brandName} piece yet.`
                                : `No ${brandName} items yet — check back shortly.`}
                        </Text>
                    )
                }
                ListFooterComponent={
                    loadingMore ? (
                        <View style={{ paddingVertical: 24 }}>
                            <ActivityIndicator color={colors.textSecondary} />
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    sortSheet: {
        borderBottomWidth: 1,
        paddingVertical: 4,
    },
    sortRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    sortLabel: {
        fontSize: 15,
        fontWeight: '500',
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
