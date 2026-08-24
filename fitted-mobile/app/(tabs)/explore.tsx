import { StyleSheet, FlatList, View, RefreshControl, Dimensions, Pressable, Text, ActivityIndicator } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { Post, User, Product } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { ExploreHeader, FeaturedStylists, TrendingGrid, SearchResults } from '@/components/ExploreComponents';
import ProductDetailModal from '@/components/ProductDetailModal';
import { computeTrendingBrands, TrendingBrand } from '@/constants/brands';
import type { BrandHit } from '@/components/ExploreComponents';

const { width } = Dimensions.get('window');
const SEARCH_ORDER_KEY = 'search_results_order';
const GRID_SIZE = width / 3;

export default function ExploreScreen() {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);
    const { searchProducts } = useMarketplaceStore();

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [posts, setPosts] = useState<Post[]>([]);
    const [featuredStylists, setFeaturedStylists] = useState<User[]>([]);

    // Search State
    const [searching, setSearching] = useState(false);
    const [userResults, setUserResults] = useState<User[]>([]);
    const [brandResults, setBrandResults] = useState<BrandHit[]>([]);
    const [shopResults, setShopResults] = useState<User[]>([]);
    // Whether people outrank labels in the results. A device preference rather
    // than an account one: it is about how somebody reads a list, and it should
    // apply the moment they change it, offline included.
    const [accountsFirst, setAccountsFirst] = useState(false);
    const [productResults, setProductResults] = useState<Product[]>([]);

    // Product Modal State
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    // Loading State
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        AsyncStorage.getItem(SEARCH_ORDER_KEY)
            .then((value) => { if (value) setAccountsFirst(value === 'accounts'); })
            .catch(() => {});
    }, []);

    const toggleSearchOrder = () => {
        setAccountsFirst((previous) => {
            const next = !previous;
            AsyncStorage.setItem(SEARCH_ORDER_KEY, next ? 'accounts' : 'brands').catch(() => {});
            return next;
        });
    };

    // Initial Fetch
    useFocusEffect(
        useCallback(() => {
            fetchContent();
        }, [])
    );

    const fetchContent = async () => {
        try {
            await Promise.all([
                fetchPosts(),
                fetchFeaturedStylists()
            ]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchPosts = async () => {
        const { data } = await supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);

        if (data) setPosts(data);
    };

    const fetchFeaturedStylists = async () => {
        // Featured Stylists must only ever contain VERIFIED stylists. This flag is
        // server-controlled (set by the sync-entitlement function after a real
        // RevenueCat purchase), so non-stylists can never appear here.
        const { data } = await supabase
            .from('users')
            .select('*')
            .eq('is_verified_stylist', true)
            .limit(10);

        setFeaturedStylists(data ?? []);
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);

        if (query.trim().length < 2) {
            setUserResults([]);
            setBrandResults([]);
            setShopResults([]);
            setProductResults([]);
            setSearching(false);
            return;
        }

        setSearching(true);

        // Parallel search for Accounts, Shops, Brands, and Products
        const [accountsRes, shopsRes, directoryRes, products] = await Promise.all([
            // Accounts
            supabase
                .from('users')
                .select('*')
                .or(`username.ilike.%${query}%,handle.ilike.%${query}%`)
                .eq('is_business_account', false) // Exclude business/brands
                .limit(10),

            // Shops — business accounts that sell on Emode.
            supabase
                .from('users')
                .select('*')
                .or(`username.ilike.%${query}%,handle.ilike.%${query}%`)
                .eq('is_business_account', true)
                .limit(5),

            // Labels from the brand directory.
            //
            // "Brands" used to mean business accounts and nothing else, so the
            // header promised brands while searching a table of ~2 users:
            // typing "loewe" found nothing even with 700 Loewe pieces in the
            // catalogue. Ordered so brands people here actually wear come first.
            supabase
                .from('brands')
                .select('slug, name, post_count')
                .ilike('name', `%${query}%`)
                .order('post_count', { ascending: false })
                .limit(8),

            // Products
            searchProducts(query)
        ]);

        if (accountsRes.data) setUserResults(accountsRes.data);
        if (shopsRes.data) setShopResults(shopsRes.data);
        if (directoryRes.data) setBrandResults(directoryRes.data as BrandHit[]);
        setProductResults(products);

        setSearching(false);
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchContent();
    };

    // Navigation Handlers
    const handleViewProfile = (userId: string) => {
        router.push({ pathname: '/user/[id]', params: { id: userId } });
    };

    // Trending brands derived from the brands featured across recent fits
    const trendingBrands = useMemo(() => computeTrendingBrands(posts), [posts]);

    const handleViewBrand = (brand: TrendingBrand) => {
        router.push({
            pathname: '/trend/[id]',
            params: { id: brand.name, name: brand.name, logo: brand.logoUrl ?? '' }
        });
    };

    // The brand page keys off the display name, not the slug — it matches
    // brand_items.brand_name — so pass the name through as the route id.
    const handleViewBrandPage = (brand: BrandHit) => {
        router.push({ pathname: '/brand/[id]', params: { id: brand.name } });
    };

    const handleOpenPost = (post: Post) => {
        router.push({ pathname: '/post/[id]', params: { id: post.id } });
    };


    // Render Helpers
    const renderPostThumbnail = ({ item }: { item: Post }) => (
        <Pressable
            style={styles.gridItem}
            onPress={() => handleOpenPost(item)}
        >
            <Image
                source={{ uri: item.generated_image }}
                style={styles.gridImage}
                contentFit="cover"
                transition={500}
            />
            {item.likes_count > 0 && (
                <View style={styles.likesOverlay}>
                    <View style={styles.likesPill}>
                        <Text style={styles.likesText}>{item.likes_count}</Text>
                        <Text style={{ fontSize: 8 }}>🔥</Text>
                    </View>
                </View>
            )}
        </Pressable>
    );

    const renderHeader = () => {
        if (searchQuery.length > 0) return null; // Use main search view

        return (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <FeaturedStylists stylists={featuredStylists} onViewProfile={handleViewProfile} />
                <TrendingGrid brands={trendingBrands} onViewBrand={handleViewBrand} />
                <View style={{ marginBottom: 20 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Explore</Text>
                </View>
            </View>
        );
    };

    const isSearching = searchQuery.length > 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
            {/* Sticky Header */}
            <ExploreHeader
                searchQuery={searchQuery}
                onSearchChange={handleSearch}
                onClear={() => handleSearch('')}
            />

            {isSearching ? (
                // Search Results View
                <View style={{ flex: 1 }}>
                    <SearchResults
                        query={searchQuery}
                        results={userResults}
                        brandResults={brandResults}
                        shopResults={shopResults}
                        onViewBrandPage={handleViewBrandPage}
                        accountsFirst={accountsFirst}
                        onToggleOrder={toggleSearchOrder}
                        productResults={productResults}
                        loading={searching}
                        onViewProfile={handleViewProfile}
                        onViewProduct={setSelectedProduct}
                    />
                </View>
            ) : (
                // Default View
                <FlatList
                    data={posts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPostThumbnail}
                    numColumns={3}
                    ListHeaderComponent={renderHeader}
                    contentContainerStyle={{ paddingBottom: 0 }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
                    }
                    style={{ marginHorizontal: 0 }}
                />
            )}

            {/* Product Detail Modal */}
            <ProductDetailModal
                product={selectedProduct}
                visible={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // No padding here to allow sticky header background to maintain negative margins logic if needed,
        // but React Native Sticky Headers work differently. 
        // We'll just put the ExploreHeader at the top (it's absolute styled in ExploreComponents, wait check).
        // Spec: "Sticky Search Header... position: sticky".
        // React Native: Sticky headers are tricky.
        // My ExploreHeader implementation uses 'position: absolute'.
        // This means it overlaps content. We need to add paddingTop to the content container.
        paddingTop: 60, // approximate height of header
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    gridItem: {
        width: GRID_SIZE,
        height: GRID_SIZE,
        // margin: 1, // Removed margin
        position: 'relative',
        backgroundColor: '#e4e4e7', // zinc-200 placeholder
    },
    gridImage: {
        width: '100%',
        height: '100%',
    },
    likesOverlay: {
        position: 'absolute',
        top: 4,
        right: 4,
    },
    likesPill: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        // backdropFilter not supported in RN StyleSheet
    },
    likesText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'white',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    // Utils
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
