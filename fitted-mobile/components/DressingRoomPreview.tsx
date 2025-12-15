import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, FlatList, Dimensions, ActivityIndicator, Alert, ActionSheetIOS, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/hooks/useTheme';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useAuthStore } from '@/stores/authStore';
import { Product } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SIZE = (SCREEN_WIDTH - 48) / 2;
const IMAGE_SIZE = SCREEN_WIDTH - 32; // Square image container

interface DressingRoomPreviewProps {
    visible: boolean;
    onClose: () => void;
}

export default function DressingRoomPreview({ visible, onClose }: DressingRoomPreviewProps) {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);

    const {
        dressingRoomItems,
        selectedDressingRoomIds,
        toggleDressingRoomSelection,
        generatedOutfitUrl,
        isGeneratingOutfit,
        generateDressingRoomOutfit,
        addToCart,
        cartItems,
        addToDressingRoom,
    } = useMarketplaceStore();

    // Local uploaded images (not from marketplace)
    const [uploadedImages, setUploadedImages] = useState<{ id: string; uri: string; name: string }[]>([]);

    const formatPrice = (price: number) => `$${price.toFixed(2)}`;

    const totalPrice = dressingRoomItems
        .filter(item => selectedDressingRoomIds.includes(item.id))
        .reduce((sum, item) => sum + item.price, 0);

    // Generate outfit on open if we have selections but no image
    useEffect(() => {
        if (visible && selectedDressingRoomIds.length > 0 && !generatedOutfitUrl && !isGeneratingOutfit && user?.id) {
            generateDressingRoomOutfit(user.id);
        }
    }, [visible, selectedDressingRoomIds.length, user?.id]);

    const handleRegenerate = async () => {
        if (!user?.id) return;
        // Allow generating if we have at least one selected product OR one uploaded image
        if (selectedDressingRoomIds.length === 0 && uploadedImages.length === 0) {
            Alert.alert('No Items Selected', 'Please select at least one item or upload an image to generate an outfit.');
            return;
        }
        // Force regenerate and pass uploaded image URIs
        const uploadedUris = uploadedImages.map(img => img.uri);
        await generateDressingRoomOutfit(user.id, true, uploadedUris);
    };

    const handleAddToCart = async (product: Product) => {
        if (!user?.id) return;
        await addToCart(product, user.id);
        Alert.alert('Added to Cart', `${product.name} has been added to your cart.`);
    };

    const isInCart = (productId: string) => cartItems.some(item => item.id === productId);

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
            const newImage = {
                id: 'upload_' + Date.now(),
                uri: result.assets[0].uri,
                name: 'Uploaded Item',
            };
            setUploadedImages(prev => [...prev, newImage]);
        }
    };

    const removeUploadedImage = (id: string) => {
        setUploadedImages(prev => prev.filter(img => img.id !== id));
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

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <Pressable onPress={onClose} style={styles.backButton}>
                        <Feather name="arrow-left" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Outfit Preview</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Generated Image - Square */}
                <View style={[styles.imageContainer, { backgroundColor: colors.backgroundSecondary }]}>
                    {isGeneratingOutfit ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                                Generating outfit...
                            </Text>
                        </View>
                    ) : generatedOutfitUrl ? (
                        <Image
                            source={{ uri: generatedOutfitUrl }}
                            style={styles.generatedImage}
                            contentFit="cover"
                        />
                    ) : (
                        <View style={styles.placeholderContainer}>
                            <Feather name="image" size={48} color={colors.textSecondary} />
                            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                                Select items and tap Regenerate
                            </Text>
                        </View>
                    )}
                </View>

                {/* Uploaded Images Section */}
                {uploadedImages.length > 0 && (
                    <View style={styles.uploadedSection}>
                        <Text style={[styles.uploadedTitle, { color: colors.text }]}>Uploaded Items</Text>
                        <FlatList
                            horizontal
                            data={uploadedImages}
                            keyExtractor={(item) => item.id}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 16 }}
                            renderItem={({ item }) => (
                                <View style={styles.uploadedItem}>
                                    <Image source={{ uri: item.uri }} style={styles.uploadedImage} contentFit="cover" />
                                    <Pressable style={styles.removeUpload} onPress={() => removeUploadedImage(item.id)}>
                                        <Feather name="x" size={12} color="#fff" />
                                    </Pressable>
                                </View>
                            )}
                        />
                    </View>
                )}

                {/* Items Grid */}
                <View style={styles.gridContainer}>
                    <View style={styles.gridHeader}>
                        <Text style={[styles.gridTitle, { color: colors.text }]}>
                            Items ({selectedDressingRoomIds.length} selected)
                        </Text>
                        <Pressable onPress={handleUploadImage} style={[styles.uploadButton, { backgroundColor: colors.primary }]}>
                            <Feather name="plus" size={16} color="#fff" />
                            <Text style={styles.uploadButtonText}>Add Image</Text>
                        </Pressable>
                    </View>
                    <FlatList
                        data={dressingRoomItems}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
                        numColumns={2}
                        contentContainerStyle={styles.gridContent}
                        columnWrapperStyle={styles.row}
                        showsVerticalScrollIndicator={false}
                    />
                </View>

                {/* Regenerate Button */}
                <View style={[styles.actionBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    <Pressable
                        style={styles.regenerateButton}
                        onPress={handleRegenerate}
                        disabled={isGeneratingOutfit || selectedDressingRoomIds.length === 0}
                    >
                        <LinearGradient
                            colors={isGeneratingOutfit ? ['#6b7280', '#9ca3af'] : ['#9333EA', '#EC4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.regenerateGradient}
                        >
                            {isGeneratingOutfit ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Feather name="refresh-cw" size={20} color="#fff" />
                            )}
                            <Text style={styles.regenerateText}>
                                {isGeneratingOutfit ? 'Generating...' : 'Regenerate Outfit'}
                            </Text>
                        </LinearGradient>
                    </Pressable>
                </View>
            </View>
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
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
    imageContainer: {
        width: IMAGE_SIZE,
        height: IMAGE_SIZE,
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 12,
        overflow: 'hidden',
        alignSelf: 'center',
    },
    generatedImage: {
        width: '100%',
        height: '100%',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        fontWeight: '500',
    },
    placeholderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    placeholderText: {
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    gridContainer: {
        flex: 1,
        marginTop: 16,
    },
    gridHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    gridTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    totalText: {
        fontSize: 16,
        fontWeight: '800',
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
        marginTop: 12,
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
        width: 60,
        height: 60,
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
        paddingHorizontal: 16,
        paddingBottom: 100,
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
        height: ITEM_SIZE * 0.8,
        backgroundColor: '#f3f4f6',
    },
    checkmark: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    itemInfo: {
        padding: 10,
        gap: 4,
    },
    itemName: {
        fontSize: 13,
        fontWeight: '600',
    },
    itemPrice: {
        fontSize: 14,
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
    actionBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 32,
        borderTopWidth: 1,
    },
    regenerateButton: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    regenerateGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 10,
    },
    regenerateText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
});
