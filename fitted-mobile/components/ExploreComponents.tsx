import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Dimensions, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { User, Product } from '@/types';
import { TrendingBrand, getBrandLogoUrl } from '@/constants/brands';
import ProductCard from '@/components/ProductCard';
import UserBadges from '@/components/UserBadges';

// Constants
const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 4) / 3;

// --- Types ---
interface ExploreHeaderProps {
    searchQuery: string;
    onSearchChange: (text: string) => void;
    onClear: () => void;
}

interface FeaturedStylistsProps {
    stylists: User[];
    onViewProfile: (userId: string) => void;
}

interface TrendingGridProps {
    brands: TrendingBrand[];
    onViewBrand: (brand: TrendingBrand) => void;
}

/** A label from the brand directory, as opposed to an account on Emode. */
export interface BrandHit {
    slug: string;
    name: string;
    post_count: number | null;
}

interface SearchResultsProps {
    query: string;
    /** Whether people rank above labels in the results. Persisted per device. */
    accountsFirst?: boolean;
    onToggleOrder?: () => void;
    results: User[];
    /** Labels from the directory — Loewe, Supreme — not accounts. */
    brandResults?: BrandHit[];
    /** Business accounts that sell here. Brands in a different sense. */
    shopResults?: User[];
    productResults?: Product[];
    loading: boolean;
    onViewProfile: (userId: string) => void;
    onViewProduct?: (product: Product) => void;
    onViewBrandPage?: (brand: BrandHit) => void;
}

// --- Components ---

// 1. Sticky Search Header
export const ExploreHeader = ({ searchQuery, onSearchChange, onClear }: ExploreHeaderProps) => {
    const { colors, isDark } = useTheme();
    const [isFocused, setIsFocused] = React.useState(false);

    return (
        <View style={[styles.headerContainer, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.searchWrapper}>
                <Feather
                    name="search"
                    size={18}
                    color="#a1a1aa" // gray-400 (matches spec)
                    style={styles.searchIcon}
                />
                <TextInput
                    style={[
                        styles.searchInput,
                        {
                            backgroundColor: isDark ? '#18181b' : '#ffffff', // zinc-900 : white
                            borderColor: isFocused
                                ? '#a1a1aa' // active border: zinc-400 (gray)
                                : (isDark ? '#27272a' : '#e5e7eb'), // default border
                            borderWidth: isFocused ? 2 : 1, // Thickened border on focus
                            color: colors.text
                        }
                    ]}
                    placeholder="Search brands, styles, people..."
                    placeholderTextColor="#a1a1aa" // gray-400
                    value={searchQuery}
                    onChangeText={onSearchChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                    <Pressable onPress={onClear} style={styles.clearButton}>
                        <Feather name="x" size={16} color="#a1a1aa" />
                    </Pressable>
                )}
            </View>
        </View>
    );
};

// 2. Featured Stylists
export const FeaturedStylists = ({ stylists, onViewProfile }: FeaturedStylistsProps) => {
    const { colors } = useTheme();

    return (
        <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
                <Feather name="award" size={20} color="#eab308" style={{ marginRight: 8 }} />
                {/* Visual substitute for Trophy, can switch to MaterialCommunityIcons 'trophy' if preferred, but user said Feather proxy */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Featured Stylists</Text>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 4, gap: 16 }}
            >
                {stylists.map((stylist) => (
                    <Pressable
                        key={stylist.id}
                        style={styles.stylistItem}
                        onPress={() => onViewProfile(stylist.id)}
                    >
                        <LinearGradient
                            colors={['#facc15', '#fb923c', '#fef08a']} // yellow-400, orange-300, yellow-200
                            start={{ x: 0, y: 1 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.gradientRing}
                        >
                            <View style={[styles.avatarContainer, { borderColor: colors.backgroundSecondary }]}>
                                <Image source={{ uri: stylist.avatar_url }} style={styles.stylistAvatar} />
                            </View>
                        </LinearGradient>
                        <Text
                            numberOfLines={1}
                            style={[styles.stylistName, { color: colors.text }]}
                        >
                            {stylist.username}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
};

// 3. Trending Now — the brands featured in the most fits right now.
// Each card shows the brand's logo (pulled from logo.dev) over a neutral surface,
// with a gradient + brand name at the bottom. Tapping opens that brand's top fits.
const BrandCard = ({ brand, onPress }: { brand: TrendingBrand; onPress: () => void }) => {
    const { colors, isDark } = useTheme();
    const [logoFailed, setLogoFailed] = React.useState(false);
    const showLogo = !!brand.logoUrl && !logoFailed;

    return (
        <Pressable
            style={[styles.trendCard, { backgroundColor: isDark ? '#27272a' : '#ffffff' }]}
            onPress={onPress}
        >
            {showLogo ? (
                <Image
                    source={{ uri: brand.logoUrl! }}
                    style={styles.brandLogo}
                    contentFit="contain"
                    transition={300}
                    onError={() => setLogoFailed(true)}
                />
            ) : (
                // Fallback when no logo resolves: brand initial on the surface
                <View style={styles.brandFallback}>
                    <Text style={[styles.brandInitial, { color: colors.textTertiary }]}>
                        {brand.name.charAt(0).toUpperCase()}
                    </Text>
                </View>
            )}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.75)']}
                style={styles.trendOverlay}
            >
                <Text style={styles.trendName} numberOfLines={1}>{brand.name}</Text>
            </LinearGradient>
        </Pressable>
    );
};

export const TrendingGrid = ({ brands, onViewBrand }: TrendingGridProps) => {
    const { colors } = useTheme();

    // Nothing to show until fits with brands exist — hide the section entirely
    // rather than render an empty grid.
    if (brands.length === 0) return null;

    return (
        <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
                <Feather name="trending-up" size={20} color="#ea580c" style={{ marginRight: 8 }} />
                {/* Visual substitute for Flame */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending Now</Text>
            </View>
            <View style={styles.trendGrid}>
                {brands.map((brand) => (
                    <BrandCard
                        key={brand.name}
                        brand={brand}
                        onPress={() => onViewBrand(brand)}
                    />
                ))}
            </View>
        </View>
    );
};

// 4. Search Results
export const SearchResults = ({ results, brandResults = [], shopResults = [], productResults = [], loading, onViewProfile, onViewProduct, onViewBrandPage, accountsFirst = false, onToggleOrder }: SearchResultsProps) => {
    const { colors } = useTheme();

    if (loading) {
        return (
            <View style={{ flex: 1, paddingTop: 40, alignItems: 'center' }}>
                <ActivityIndicator color={colors.text} />
            </View>
        );
    }

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={styles.resultsContainer}>
                {/* Products Section */}
                {productResults.length > 0 && onViewProduct && (
                    <View style={{ marginBottom: 24 }}>
                        <Text style={[styles.resultsHeader, { color: colors.textSecondary }]}>ITEMS</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 12, paddingRight: 16 }}
                        >
                            {productResults.map(product => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    onPress={() => onViewProduct(product)}
                                    size="small"
                                />
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Order control. Searching a person meant scrolling past every
                    label that matched first, which is the wrong way round for
                    anybody who mostly looks up people. */}
                {(brandResults.length > 0 || results.length > 0) && onToggleOrder && (
                    <Pressable onPress={onToggleOrder} style={styles.orderToggle}>
                        <Feather name="repeat" size={12} color={colors.textSecondary} />
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                            {accountsFirst ? 'Accounts first' : 'Brands first'}
                        </Text>
                    </Pressable>
                )}

                {accountsFirst && results.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                        <Text style={[styles.resultsHeader, { color: colors.textSecondary }]}>ACCOUNTS</Text>
                        {results.map(user => (
                            <UserResultRow key={user.id} user={user} onViewProfile={onViewProfile} />
                        ))}
                    </View>
                )}

                {/* Brands Section — labels from the directory */}
                {brandResults.length > 0 && onViewBrandPage && (
                    <View style={{ marginBottom: 16 }}>
                        <Text style={[styles.resultsHeader, { color: colors.textSecondary }]}>BRANDS</Text>
                        {brandResults.map(brand => (
                            <BrandResultRow key={brand.slug} brand={brand} onPress={() => onViewBrandPage(brand)} />
                        ))}
                    </View>
                )}

                {/* Shops Section — business accounts */}
                {shopResults.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                        <Text style={[styles.resultsHeader, { color: colors.textSecondary }]}>SHOPS</Text>
                        {shopResults.map(user => (
                            <UserResultRow key={user.id} user={user} onViewProfile={onViewProfile} />
                        ))}
                    </View>
                )}

                {/* Accounts Section. Hidden when another section matched but this
                    one did not, rather than leaving a header over empty space --
                    and skipped entirely when it has already been rendered above. */}
                {!accountsFirst && results.length > 0 && (
                    <View>
                        <Text style={[styles.resultsHeader, { color: colors.textSecondary }]}>ACCOUNTS</Text>
                        {results.map(user => (
                            <UserResultRow key={user.id} user={user} onViewProfile={onViewProfile} />
                        ))}
                    </View>
                )}

                {results.length === 0 && brandResults.length === 0 && shopResults.length === 0 && productResults.length === 0 && (
                    <Text style={{ fontSize: 14, color: colors.textSecondary, paddingLeft: 8 }}>No results found.</Text>
                )}
            </View>
        </ScrollView>
    );
};

/**
 * A brand from the directory.
 *
 * Deliberately not a UserResultRow: these are labels, not accounts. There is no
 * profile to open and no handle to show -- tapping goes to the brand's catalogue
 * page, and the subtitle says how present the brand is on Emode.
 */
const BrandResultRow = ({ brand, onPress }: { brand: BrandHit; onPress: () => void }) => {
    const { colors, isDark } = useTheme();
    const logo = getBrandLogoUrl(brand.name);
    const worn = brand.post_count ?? 0;

    return (
        <Pressable
            style={[styles.userRow, { backgroundColor: isDark ? '#18181b' : '#ffffff' }]}
            onPress={onPress}
        >
            <View style={[styles.userAvatarContainer, { backgroundColor: isDark ? '#27272a' : '#e5e7eb' }]}>
                {logo ? (
                    <Image source={{ uri: logo }} style={styles.userAvatar} contentFit="contain" />
                ) : (
                    <Feather name="tag" size={16} color={colors.textSecondary} />
                )}
            </View>
            <View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{brand.name}</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                    {worn > 0 ? `Worn in ${worn} ${worn === 1 ? 'fit' : 'fits'}` : 'Brand'}
                </Text>
            </View>
        </Pressable>
    );
};

const UserResultRow = ({ user, onViewProfile }: { user: User, onViewProfile: (id: string) => void }) => {
    const { colors, isDark } = useTheme();
    return (
        <Pressable
            style={[styles.userRow, { backgroundColor: isDark ? '#18181b' : '#ffffff' }]}
            onPress={() => onViewProfile(user.id)}
        >
            <View style={[styles.userAvatarContainer, { backgroundColor: isDark ? '#27272a' : '#e5e7eb' }]}>
                {user.avatar_url ? (
                    <Image source={{ uri: user.avatar_url }} style={styles.userAvatar} />
                ) : (
                    <Feather name="user" size={16} color={colors.textSecondary} />
                )}
            </View>
            <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.userName, { color: colors.text }]}>{user.username}</Text>
                    <UserBadges user={user} size={14} />
                </View>
                <Text style={[styles.userHandle, { color: colors.textSecondary }]}>{user.handle}</Text>
            </View>
        </Pressable>
    );
};


const styles = StyleSheet.create({
    orderToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 4,
        marginBottom: 4,
    },
    // Header
    headerContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        paddingTop: 8, // pt-2 equivalent
        paddingBottom: 8, // pb-2 equivalent
        paddingHorizontal: 16,
    },
    searchWrapper: {
        position: 'relative',
        justifyContent: 'center',
    },
    searchInput: {
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        paddingLeft: 40,
        paddingRight: 40,
        fontSize: 14,
        fontWeight: '500',
    },
    searchIcon: {
        position: 'absolute',
        left: 12,
        zIndex: 1,
    },
    clearButton: {
        position: 'absolute',
        right: 12,
        padding: 4,
    },

    // Components
    sectionContainer: {
        marginBottom: 32, // mb-8
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20, // mb-5
    },
    sectionTitle: {
        fontSize: 20, // text-xl
        fontWeight: '700',
        letterSpacing: -0.5, // tracking-tight
    },

    // Stylists
    stylistItem: {
        alignItems: 'center',
        gap: 8,
        minWidth: 72,
    },
    gradientRing: {
        width: 64, // w-16
        height: 64, // h-16
        borderRadius: 32,
        padding: 2, // p-0.5 approx
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarContainer: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
        borderWidth: 2,
        overflow: 'hidden',
    },
    stylistAvatar: {
        width: '100%',
        height: '100%',
    },
    stylistName: {
        fontSize: 12,
        fontWeight: '500',
        width: 72,
        textAlign: 'center',
    },

    // Trending
    trendGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12, // gap-3
    },
    trendCard: {
        width: (width - 32 - 12) / 2, // (screen - padding - gap) / 2
        height: ((width - 32 - 12) / 2) * (9 / 16), // aspect 16:9
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    brandLogo: {
        ...StyleSheet.absoluteFillObject,
        margin: 24, // inset the logo so it reads as a centered mark, not edge-to-edge
    },
    brandFallback: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    brandInitial: {
        fontSize: 40,
        fontWeight: '900',
    },
    trendOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '55%',
        justifyContent: 'flex-end',
        padding: 12,
    },
    trendName: {
        color: 'white',
        fontSize: 14,
        fontWeight: '700',
    },

    // Search Results
    resultsContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    hashtagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    hashIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    hashMainText: {
        fontSize: 14,
        fontWeight: '700',
    },
    hashSubText: {
        fontSize: 12,
    },
    resultsHeader: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 8,
        letterSpacing: 0.5,
        paddingLeft: 8,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        marginBottom: 8,
    },
    userAvatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    userAvatar: {
        width: '100%',
        height: '100%',
    },
    userName: {
        fontSize: 14,
        fontWeight: '700',
    },
    userHandle: {
        fontSize: 12,
    },
});
