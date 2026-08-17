import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TextInput,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchProducts, Product } from '../services/aiService';
import { useTheme } from '@/hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = (SCREEN_WIDTH - 48) / 2; // 2 columns with padding

/**
 * Get product image URL using Bing Image Search
 */
function getProductImageUrl(product: Product): string {
    return product.imageUrl || '';
}

interface ProductSearchModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectProduct: (product: Product) => void;
}

export default function ProductSearchModal({
    visible,
    onClose,
    onSelectProduct,
}: ProductSearchModalProps) {
    const { colors } = useTheme();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    const RECENT_SEARCHES_KEY = 'emode_recent_product_searches';
    const MAX_RECENT_SEARCHES = 8;

    // Load recent searches on mount
    useEffect(() => {
        loadRecentSearches();
    }, [visible]);

    const loadRecentSearches = async () => {
        try {
            const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
            if (stored) {
                setRecentSearches(JSON.parse(stored));
            }
        } catch (error) {
            console.error('Failed to load recent searches:', error);
        }
    };

    const saveRecentSearch = async (searchQuery: string) => {
        try {
            const trimmed = searchQuery.trim().toLowerCase();
            // Filter out duplicate and add to front
            const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
            setRecentSearches(updated);
            await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        } catch (error) {
            console.error('Failed to save recent search:', error);
        }
    };

    const clearRecentSearches = async () => {
        try {
            setRecentSearches([]);
            await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
        } catch (error) {
            console.error('Failed to clear recent searches:', error);
        }
    };

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;

        setLoading(true);
        setSearched(true);

        try {
            const products = await searchProducts(query.trim());
            setResults(products);
            // Save to recent searches
            await saveRecentSearch(query.trim());
        } catch (error) {
            console.error('Search failed:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [query, recentSearches]);

    const handleRecentSearchTap = useCallback((searchTerm: string) => {
        setQuery(searchTerm);
        // Trigger search immediately
        setLoading(true);
        setSearched(true);
        searchProducts(searchTerm).then(products => {
            setResults(products);
            setLoading(false);
        }).catch(() => {
            setResults([]);
            setLoading(false);
        });
    }, []);

    const handleSelect = useCallback((product: Product) => {
        onSelectProduct(product);
        // Reset state
        setQuery('');
        setResults([]);
        setSearched(false);
    }, [onSelectProduct]);

    const handleClose = useCallback(() => {
        setQuery('');
        setResults([]);
        setSearched(false);
        onClose();
    }, [onClose]);

    const renderProduct = useCallback(({ item }: { item: Product }) => (
        <TouchableOpacity
            style={[styles.productCard, { backgroundColor: colors.backgroundSecondary }]}
            onPress={() => handleSelect(item)}
            activeOpacity={0.8}
        >
            <View style={[styles.imageContainer, { backgroundColor: '#fff' }]}>
                <Image
                    source={{ uri: getProductImageUrl(item) }}
                    style={styles.productImage}
                    contentFit="contain"
                />
            </View>
            <View style={styles.productInfo}>
                <Text style={[styles.productBrand, { color: colors.textSecondary }]}>{item.brand}</Text>
                <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                {item.price > 0 && (
                    <Text style={[styles.productPrice, { color: colors.primary }]}>${item.price}</Text>
                )}
            </View>
            <View style={[styles.addButton, { backgroundColor: colors.primary }]}>
                <Feather name="plus" size={16} color={colors.primaryForeground} />
            </View>
        </TouchableOpacity>
    ), [handleSelect, colors]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={[styles.container, { backgroundColor: colors.background }]}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                        <Feather name="x" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.text }]}>Find Products</Text>
                    <View style={styles.placeholder} />
                </View>

                {/* Search Bar */}
                <View style={[styles.searchContainer, { backgroundColor: colors.backgroundSecondary }]}>
                    <Feather name="search" size={20} color={colors.textTertiary} style={styles.searchIcon} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="Search sneakers, clothing..."
                        placeholderTextColor={colors.textTertiary}
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={handleSearch}
                        returnKeyType="search"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => setQuery('')}>
                            <Feather name="x-circle" size={20} color={colors.textTertiary} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.searchButton, { backgroundColor: colors.primary }]} onPress={handleSearch}>
                        <Text style={[styles.searchButtonText, { color: colors.primaryForeground }]}>Search</Text>
                    </TouchableOpacity>
                </View>

                {/* Results */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Searching...</Text>
                    </View>
                ) : results.length > 0 ? (
                    <FlatList
                        data={results}
                        renderItem={renderProduct}
                        keyExtractor={(item) => item.id}
                        numColumns={2}
                        contentContainerStyle={styles.resultsContainer}
                        columnWrapperStyle={styles.row}
                        showsVerticalScrollIndicator={false}
                    />
                ) : searched ? (
                    <View style={styles.emptyContainer}>
                        <Feather name="search" size={48} color={colors.textTertiary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No products found</Text>
                        <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>Try a different search term</Text>
                    </View>
                ) : (
                    <ScrollView style={styles.recentContainer} contentContainerStyle={styles.recentContent}>
                        {recentSearches.length > 0 && (
                            <View style={styles.recentSection}>
                                <View style={styles.recentHeader}>
                                    <Text style={[styles.recentTitle, { color: colors.text }]}>Recent Searches</Text>
                                    <TouchableOpacity onPress={clearRecentSearches}>
                                        <Text style={[styles.clearText, { color: colors.tint }]}>Clear</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.recentList}>
                                    {recentSearches.map((term, index) => (
                                        <TouchableOpacity
                                            key={`${term}-${index}`}
                                            style={[styles.recentChip, { backgroundColor: colors.backgroundSecondary }]}
                                            onPress={() => handleRecentSearchTap(term)}
                                        >
                                            <Feather name="clock" size={14} color={colors.textTertiary} />
                                            <Text style={[styles.recentChipText, { color: colors.text }]}>{term}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}
                        <View style={styles.emptyContainer}>
                            <Feather name="shopping-bag" size={48} color={colors.textTertiary} />
                            <Text style={[styles.emptyText, { color: colors.text }]}>Search for products</Text>
                            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                                Find sneakers and clothing from StockX, GOAT & more
                            </Text>
                        </View>
                    </ScrollView>
                )}
            </KeyboardAvoidingView>
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
        paddingTop: 60,
        paddingBottom: 16,
        borderBottomWidth: 1,
    },
    closeButton: {
        padding: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    placeholder: {
        width: 40,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginVertical: 16,
        paddingHorizontal: 12,
        borderRadius: 12,
        height: 48,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Inter_400Regular',
    },
    searchButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        marginLeft: 8,
    },
    searchButtonText: {
        fontWeight: '600',
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        fontFamily: 'Inter_500Medium',
    },
    resultsContainer: {
        padding: 16,
    },
    row: {
        justifyContent: 'space-between',
    },
    productCard: {
        width: ITEM_WIDTH,
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
    },
    imageContainer: {
        width: '100%',
        height: ITEM_WIDTH * 0.8,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    productImage: {
        width: '100%',
        height: '100%',
    },
    productInfo: {
        padding: 10,
    },
    productBrand: {
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontFamily: 'Inter_600SemiBold',
    },
    productName: {
        fontSize: 13,
        fontWeight: '500',
        marginTop: 2,
        lineHeight: 18,
        fontFamily: 'Inter_500Medium',
    },
    productPrice: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 6,
        fontFamily: 'Inter_700Bold',
    },
    addButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
        fontFamily: 'Inter_600SemiBold',
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        fontFamily: 'Inter_400Regular',
    },
    recentContainer: {
        flex: 1,
    },
    recentContent: {
        flexGrow: 1,
    },
    recentSection: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    recentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    recentTitle: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Inter_600SemiBold',
    },
    clearText: {
        fontSize: 14,
        fontFamily: 'Inter_500Medium',
    },
    recentList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    recentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    recentChipText: {
        fontSize: 14,
        fontFamily: 'Inter_500Medium',
    },
});
