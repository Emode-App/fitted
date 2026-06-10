import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Product } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useAuthStore } from '@/stores/authStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ProductCardProps {
    product: Product;
    onPress: () => void;
    size?: 'small' | 'medium' | 'large' | 'flex';
    onEdit?: () => void;
    onDelete?: () => void;
}

export default function ProductCard({ product, onPress, size = 'medium', onEdit, onDelete }: ProductCardProps) {
    const { colors, isDark } = useTheme();
    const { addToCart, cartItems } = useMarketplaceStore();
    const user = useAuthStore(state => state.user);

    // Check if current user is the owner
    const isOwner = user?.id === product.seller_id;

    // Flex size uses percentage width for better grid layout
    const cardSize = size === 'flex'
        ? { width: (SCREEN_WIDTH - 48) / 2, imageHeight: (SCREEN_WIDTH - 48) / 2 }
        : {
            small: { width: 120, imageHeight: 120 },
            medium: { width: 160, imageHeight: 160 },
            large: { width: 200, imageHeight: 200 },
        }[size];

    const formatPrice = (price: number) => {
        return `$${price.toFixed(2)}`;
    };

    const isInCart = cartItems.some(item => item.id === product.id);

    const handleAddToCart = async () => {
        if (!user?.id) {
            Alert.alert('Sign In Required', 'Please sign in to add items to your cart.');
            return;
        }
        await addToCart(product, user.id);
        Alert.alert('Added to Cart', `${product.name} has been added to your cart.`);
    };

    const handleDelete = () => {
        Alert.alert(
            'Delete Listing',
            'Are you sure you want to delete this listing? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: onDelete },
            ]
        );
    };

    return (
        <Pressable
            style={[
                styles.container,
                {
                    width: cardSize.width,
                    backgroundColor: colors.backgroundSecondary,
                    shadowColor: isDark ? '#000' : '#000',
                }
            ]}
            onPress={onPress}
        >
            {/* Product Image */}
            <Image
                source={{ uri: product.image_urls[0] }}
                style={[styles.image, { height: cardSize.imageHeight }]}
                contentFit="cover"
            />

            {/* Verified Badge */}
            {product.seller?.is_verified_boutique && (
                <View style={styles.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
                </View>
            )}

            {/* Owner Actions (Edit/Delete) */}
            {isOwner && (
                <View style={styles.ownerActions}>
                    {onEdit && (
                        <Pressable
                            style={styles.ownerButton}
                            onPress={(e) => { e.stopPropagation?.(); onEdit(); }}
                        >
                            <Feather name="edit-2" size={14} color="#fff" />
                        </Pressable>
                    )}
                    {onDelete && (
                        <Pressable
                            style={[styles.ownerButton, styles.deleteButton]}
                            onPress={(e) => { e.stopPropagation?.(); handleDelete(); }}
                        >
                            <Feather name="trash-2" size={14} color="#fff" />
                        </Pressable>
                    )}
                </View>
            )}

            {/* Product Info */}
            <View style={styles.info}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {product.name}
                </Text>
                <Text style={[styles.price, { color: colors.primary }]}>
                    {formatPrice(product.price)}
                </Text>
                <View style={styles.metaRow}>
                    {product.sizes.length > 0 && (
                        <Text style={[styles.sizes, { color: colors.textSecondary }]}>
                            {product.sizes.slice(0, 3).join(', ')}{product.sizes.length > 3 ? '...' : ''}
                        </Text>
                    )}
                </View>
                {product.seller && (
                    <Text style={[styles.seller, { color: colors.textSecondary }]} numberOfLines={1}>
                        {product.seller.handle?.startsWith('@') ? product.seller.handle : `@${product.seller.handle}`}
                    </Text>
                )}

                {/* Add to Cart button - styled like dressing room */}
                <Pressable
                    style={[
                        styles.cartButton,
                        isInCart
                            ? { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                            : { backgroundColor: colors.background, borderColor: colors.border }
                    ]}
                    onPress={(e) => {
                        e.stopPropagation?.();
                        if (!isInCart) handleAddToCart();
                    }}
                    disabled={isInCart}
                >
                    <Feather
                        name={isInCart ? "check" : "shopping-cart"}
                        size={14}
                        color={isInCart ? colors.primary : colors.text}
                    />
                    <Text style={[
                        styles.cartButtonText,
                        { color: isInCart ? colors.primary : colors.text }
                    ]}>
                        {isInCart ? 'In Cart' : 'Add to Cart'}
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 12,
        overflow: 'hidden',
        // Shadow for iOS
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        // Shadow for Android
        elevation: 4,
    },
    image: {
        width: '100%',
        backgroundColor: '#f3f4f6',
    },
    verifiedBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 10,
        padding: 4,
    },
    ownerActions: {
        position: 'absolute',
        top: 8,
        left: 8,
        flexDirection: 'row',
        gap: 6,
    },
    ownerButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButton: {
        backgroundColor: 'rgba(239,68,68,0.8)',
    },
    info: {
        padding: 10,
        gap: 2,
    },
    name: {
        fontSize: 14,
        fontWeight: '600',
    },
    price: {
        fontSize: 15,
        fontWeight: '700',
    },
    cartButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 6,
        borderWidth: 1,
        gap: 4,
        marginTop: 6,
    },
    cartButtonText: {
        fontSize: 12,
        fontWeight: '600',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sizes: {
        fontSize: 12,
    },
    seller: {
        fontSize: 12,
        marginTop: 2,
    },
});

