import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Dimensions, Alert, ActionSheetIOS, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/hooks/useTheme';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { Product } from '@/types';
import DressingRoomPreview from './DressingRoomPreview';
import ProTryOnsModal from './ProTryOnsModal';
import { canPerformTryOn, FREE_DAILY_TRYON_LIMIT } from '@/services/revenueCatService';
import { useAuthStore } from '@/stores/authStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 400); // Match SettingsDrawer width
const ITEM_SIZE = (DRAWER_WIDTH - 48) / 2; // 2-column layout with 16px padding each side + 16px gap

interface UploadedItem {
    id: string;
    uri: string;
    name: string;
}

export default function DressingRoom() {
    const { colors, isDark } = useTheme();
    const {
        dressingRoomItems,
        removeFromDressingRoom,
        clearDressingRoom,
        selectedDressingRoomIds,
        toggleDressingRoomSelection,
        selectAllDressingRoom,
    } = useMarketplaceStore();

    const [showPreview, setShowPreview] = useState(false);
    const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);
    const [showProModal, setShowProModal] = useState(false);
    const [remainingTryOns, setRemainingTryOns] = useState(FREE_DAILY_TRYON_LIMIT);
    const authUser = useAuthStore((state) => state.user);

    // Handle image upload from gallery or camera
    const handleUploadImage = async () => {
        const options = ['Take Photo', 'Choose from Gallery', 'Cancel'];

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { options, cancelButtonIndex: 2 },
                async (buttonIndex) => {
                    if (buttonIndex === 0) await pickImage('camera');
                    else if (buttonIndex === 1) await pickImage('gallery');
                }
            );
        } else {
            Alert.alert('Add Image', 'Choose source', [
                { text: 'Take Photo', onPress: () => pickImage('camera') },
                { text: 'Choose from Gallery', onPress: () => pickImage('gallery') },
                { text: 'Cancel', style: 'cancel' },
            ]);
        }
    };

    const pickImage = async (source: 'camera' | 'gallery') => {
        let result;

        if (source === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Camera permission is required.');
                return;
            }
            result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.8,
            });
        } else {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Gallery permission is required.');
                return;
            }
            result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
            });
        }

        if (!result.canceled && result.assets[0]) {
            const newItem: UploadedItem = {
                id: 'upload_' + Date.now(),
                uri: result.assets[0].uri,
                name: 'Uploaded Item',
            };
            setUploadedItems(prev => [...prev, newItem]);
        }
    };

    const removeUploadedItem = (id: string) => {
        setUploadedItems(prev => prev.filter(item => item.id !== id));
    };

    const handleGenerateOutfit = async () => {
        if (dressingRoomItems.length === 0) {
            Alert.alert('No Items', 'Add some items to your dressing room first!');
            return;
        }
        if (selectedDressingRoomIds.length === 0) {
            Alert.alert('No Selection', 'Please select at least one item to include in the outfit.');
            return;
        }

        // Check daily try-on limit
        if (authUser?.id) {
            const { allowed, remaining, isPro } = await canPerformTryOn(authUser.id);
            setRemainingTryOns(remaining);

            if (!allowed && !isPro) {
                // Show upgrade modal
                setShowProModal(true);
                return;
            }
        }

        setShowPreview(true);
    };

    const handleRemoveItem = (productId: string) => {
        removeFromDressingRoom(productId);
    };

    const handleClearAll = () => {
        Alert.alert(
            'Clear Dressing Room?',
            'This will remove all items from your dressing room.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear All', style: 'destructive', onPress: clearDressingRoom },
            ]
        );
    };

    const formatPrice = (price: number) => `$${price.toFixed(2)}`;

    const totalPrice = dressingRoomItems
        .filter(item => selectedDressingRoomIds.includes(item.id))
        .reduce((sum, item) => sum + item.price, 0);

    // Cart functionality - get from store
    const { addToCart, cartItems } = useMarketplaceStore();
    const user = require('@/stores/authStore').useAuthStore.getState().user;

    const isInCart = (productId: string) => cartItems.some(c => c.id === productId);

    const handleAddToCart = async (item: Product) => {
        if (!user?.id) {
            Alert.alert('Sign In Required', 'Please sign in to add items to your cart.');
            return;
        }
        await addToCart(item, user.id);
        Alert.alert('Added to Cart', `${item.name} has been added to your cart.`);
    };

    const renderItem = ({ item }: { item: Product }) => {
        const isSelected = selectedDressingRoomIds.includes(item.id);
        const inCart = isInCart(item.id);

        return (
            <View style={[styles.itemCard, { backgroundColor: colors.backgroundSecondary }]}>
                <Pressable onPress={() => toggleDressingRoomSelection(item.id)}>
                    <Image
                        source={{ uri: item.image_urls[0] }}
                        style={styles.itemImage}
                        contentFit="cover"
                    />
                    {/* Selection checkmark */}
                    <View style={[
                        styles.checkmark,
                        isSelected ? { backgroundColor: '#22c55e' } : { backgroundColor: 'rgba(0,0,0,0.4)' }
                    ]}>
                        {isSelected && <Feather name="check" size={14} color="#fff" />}
                    </View>
                </Pressable>
                <Pressable
                    style={styles.removeButton}
                    onPress={() => handleRemoveItem(item.id)}
                >
                    <Feather name="x" size={14} color="#fff" />
                </Pressable>
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <Text style={[styles.itemPrice, { color: colors.primary }]}>
                        {formatPrice(item.price)}
                    </Text>

                    {/* Add to Cart button */}
                    <Pressable
                        style={[
                            styles.cartButton,
                            inCart
                                ? { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                                : { backgroundColor: colors.background, borderColor: colors.border }
                        ]}
                        onPress={() => handleAddToCart(item)}
                        disabled={inCart}
                    >
                        <Feather
                            name={inCart ? "check" : "shopping-cart"}
                            size={14}
                            color={inCart ? colors.primary : colors.text}
                        />
                        <Text style={[
                            styles.cartButtonText,
                            { color: inCart ? colors.primary : colors.text }
                        ]}>
                            {inCart ? 'In Cart' : 'Add to Cart'}
                        </Text>
                    </Pressable>
                </View>
            </View>
        );
    };

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
                <Feather name="shopping-bag" size={40} color={colors.textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Your Dressing Room is Empty</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Tap "Try On?" on any product to add it here and create outfit combinations!
            </Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header with count and actions */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    {dressingRoomItems.length > 0 && (
                        <>
                            <Text style={[styles.itemCount, { color: colors.textSecondary }]}>
                                {dressingRoomItems.length} item{dressingRoomItems.length !== 1 ? 's' : ''}
                            </Text>
                            <Pressable onPress={selectAllDressingRoom}>
                                <Text style={[styles.selectAllButton, { color: colors.primary }]}>Select All</Text>
                            </Pressable>
                        </>
                    )}
                </View>
                <View style={styles.headerRight}>
                    <Pressable onPress={handleUploadImage} style={[styles.uploadButton, { backgroundColor: colors.primary }]}>
                        <Feather name="plus" size={16} color="#fff" />
                        <Text style={styles.uploadButtonText}>Add Photo</Text>
                    </Pressable>
                    {dressingRoomItems.length > 0 && (
                        <Pressable onPress={handleClearAll}>
                            <Text style={[styles.clearButton, { color: colors.error || '#ef4444' }]}>Clear All</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Uploaded Photos Section */}
            {uploadedItems.length > 0 && (
                <View style={styles.uploadedSection}>
                    <Text style={[styles.uploadedTitle, { color: colors.text }]}>Uploaded Photos</Text>
                    <FlatList
                        horizontal
                        data={uploadedItems}
                        keyExtractor={(item) => item.id}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16 }}
                        renderItem={({ item }) => (
                            <View style={styles.uploadedItem}>
                                <Image source={{ uri: item.uri }} style={styles.uploadedImage} contentFit="cover" />
                                <Pressable style={styles.removeUpload} onPress={() => removeUploadedItem(item.id)}>
                                    <Feather name="x" size={12} color="#fff" />
                                </Pressable>
                            </View>
                        )}
                    />
                </View>
            )}

            {/* Items Grid */}
            <FlatList
                data={dressingRoomItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={styles.gridContent}
                columnWrapperStyle={styles.row}
                ListEmptyComponent={renderEmpty}
                showsVerticalScrollIndicator={false}
            />

            {/* Bottom Action Bar */}
            {dressingRoomItems.length > 0 && (
                <View style={[styles.actionBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    <View style={styles.totalContainer}>
                        <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
                            Selected ({selectedDressingRoomIds.length})
                        </Text>
                        <Text style={[styles.totalPrice, { color: colors.text }]}>{formatPrice(totalPrice)}</Text>
                    </View>
                    <Pressable
                        style={[styles.generateButton, selectedDressingRoomIds.length === 0 && styles.disabledButton]}
                        onPress={handleGenerateOutfit}
                        disabled={selectedDressingRoomIds.length === 0}
                    >
                        <LinearGradient
                            colors={selectedDressingRoomIds.length === 0 ? ['#6b7280', '#9ca3af'] : ['#9333EA', '#EC4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.generateGradient}
                        >
                            <Feather name="zap" size={20} color="#fff" />
                            <Text style={styles.generateText}>Generate Outfit</Text>
                        </LinearGradient>
                    </Pressable>
                </View>
            )}

            {/* Preview Modal */}
            <DressingRoomPreview
                visible={showPreview}
                onClose={() => setShowPreview(false)}
            />

            {/* Pro Try-Ons Upgrade Modal */}
            <ProTryOnsModal
                visible={showProModal}
                onClose={() => setShowProModal(false)}
                remainingTryOns={remainingTryOns}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    itemCount: {
        fontSize: 14,
        fontWeight: '500',
    },
    selectAllButton: {
        fontSize: 14,
        fontWeight: '600',
    },
    clearButton: {
        fontSize: 14,
        fontWeight: '600',
    },
    uploadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        gap: 4,
    },
    uploadButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    uploadedSection: {
        marginBottom: 8,
    },
    uploadedTitle: {
        fontSize: 14,
        fontWeight: '600',
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    uploadedItem: {
        marginRight: 10,
        position: 'relative',
    },
    uploadedImage: {
        width: 70,
        height: 70,
        borderRadius: 8,
    },
    removeUpload: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#ef4444',
        justifyContent: 'center',
        alignItems: 'center',
    },
    gridContent: {
        padding: 16,
        paddingBottom: 120,
    },
    row: {
        gap: 16,
        marginBottom: 16,
    },
    itemCard: {
        width: ITEM_SIZE,
        borderRadius: 12,
        overflow: 'hidden',
    },
    itemImage: {
        width: '100%',
        height: ITEM_SIZE,
        backgroundColor: '#f3f4f6',
    },
    checkmark: {
        position: 'absolute',
        top: 8,
        left: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    removeButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemInfo: {
        padding: 10,
        gap: 2,
    },
    itemName: {
        fontSize: 14,
        fontWeight: '600',
    },
    itemPrice: {
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
        marginTop: 4,
    },
    cartButtonText: {
        fontSize: 12,
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 80,
        paddingHorizontal: 32,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    actionBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingBottom: 32,
        borderTopWidth: 1,
        gap: 16,
    },
    totalContainer: {
        flex: 1,
    },
    totalLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    totalPrice: {
        fontSize: 20,
        fontWeight: '800',
    },
    generateButton: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    disabledButton: {
        opacity: 0.7,
    },
    generateGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        gap: 8,
    },
    generateText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});

