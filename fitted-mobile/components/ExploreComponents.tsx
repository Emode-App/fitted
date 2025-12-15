import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Dimensions, ActivityIndicator } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { User, Product } from '@/types';
import ProductCard from '@/components/ProductCard';

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
    onViewTrend: (trend: string, image: string) => void;
}

interface SearchResultsProps {
    query: string;
    results: User[];
    brandResults?: User[];
    productResults?: Product[];
    loading: boolean;
    onViewHashtag: (tag: string) => void;
    onViewProfile: (userId: string) => void;
    onViewProduct?: (product: Product) => void;
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

// 3. Trending Now
const TRENDS = [
    { id: '1', name: 'Y2K Revival', image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=400' },
    { id: '2', name: 'Opium Core', image: 'https://images.unsplash.com/photo-1516762689617-e1cffcef479d?auto=format&fit=crop&q=80&w=400' },
    { id: '3', name: 'Quiet Luxury', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=400' },
    { id: '4', name: 'Blokecore', image: 'https://images.unsplash.com/photo-1550614000-4b9519e0031a?auto=format&fit=crop&q=80&w=400' },
];

export const TrendingGrid = ({ onViewTrend }: TrendingGridProps) => {
    const { colors } = useTheme();

    return (
        <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
                <Feather name="trending-up" size={20} color="#ea580c" style={{ marginRight: 8 }} />
                {/* Visual substitute for Flame */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending Now</Text>
            </View>
            <View style={styles.trendGrid}>
                {TRENDS.map((trend) => (
                    <Pressable
                        key={trend.id}
                        style={styles.trendCard}
                        onPress={() => onViewTrend(trend.name, trend.image)}
                    >
                        <Image source={{ uri: trend.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        <View style={styles.trendOverlay}>
                            <Text style={styles.trendName}>{trend.name}</Text>
                        </View>
                    </Pressable>
                ))}
            </View>
        </View>
    );
};

// 4. Search Results
export const SearchResults = ({ query, results, brandResults = [], productResults = [], loading, onViewHashtag, onViewProfile, onViewProduct }: SearchResultsProps) => {
    const { colors, isDark } = useTheme();
    const formattedTag = query.startsWith('#') ? query : `#${query}`;

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
                {/* Hashtag Option */}
                <Pressable
                    style={[
                        styles.hashtagRow,
                        {
                            backgroundColor: isDark ? '#18181b' : '#ffffff',
                            borderColor: isDark ? '#27272a' : '#f3f4f6'
                        }
                    ]}
                    onPress={() => onViewHashtag(formattedTag)}
                >
                    <View style={[styles.hashIconCircle, { backgroundColor: isDark ? '#27272a' : '#f3f4f6' }]}>
                        <Feather name="hash" size={20} color={colors.text} />
                    </View>
                    <View>
                        <Text style={[styles.hashMainText, { color: colors.text }]}>{formattedTag}</Text>
                        <Text style={[styles.hashSubText, { color: colors.textSecondary }]}>Go to hashtag</Text>
                    </View>
                </Pressable>

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

                {/* Brands Section */}
                {brandResults.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                        <Text style={[styles.resultsHeader, { color: colors.textSecondary }]}>BRANDS</Text>
                        {brandResults.map(user => (
                            <UserResultRow key={user.id} user={user} onViewProfile={onViewProfile} />
                        ))}
                    </View>
                )}

                {/* Accounts Section */}
                <View>
                    <Text style={[styles.resultsHeader, { color: colors.textSecondary }]}>ACCOUNTS</Text>
                    {results.length === 0 && brandResults.length === 0 && productResults.length === 0 ? (
                        <Text style={{ fontSize: 14, color: colors.textSecondary, paddingLeft: 8 }}>No results found.</Text>
                    ) : (
                        results.map(user => (
                            <UserResultRow key={user.id} user={user} onViewProfile={onViewProfile} />
                        ))
                    )}
                </View>
            </View>
        </ScrollView>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.userName, { color: colors.text }]}>{user.username}</Text>
                    {user.is_verified_stylist && (
                        <MaterialCommunityIcons name="check-decagram" size={14} color="#3b82f6" />
                    )}
                </View>
                <Text style={[styles.userHandle, { color: colors.textSecondary }]}>{user.handle}</Text>
            </View>
        </Pressable>
    );
};


const styles = StyleSheet.create({
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
    trendOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
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
