import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import * as FileSystem from 'expo-file-system/legacy';

interface ProductUploadModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

const CATEGORIES = ['Tops', 'Bottoms', 'Shoes', 'Accessories', 'Headwear'];

const SIZE_MAPPING: Record<string, string[]> = {
    'Tops': ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
    'Bottoms': ['28', '29', '30', '31', '32', '33', '34', '36', '38', '40'],
    'Shoes': ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12', '13'],
    'Accessories': ['One Size (OS)'],
    'Headwear': ['One Size (OS)'],
};

const SUGGESTED_TAGS = ['streetwear', 'vintage', 'secondhand', 'luxury', 'activewear', 'casual', 'formal'];

export default function ProductUploadModal({ visible, onClose, onSuccess }: ProductUploadModalProps) {
    const { colors, isDark } = useTheme();
    const { user } = useAuthStore();

    const [images, setImages] = useState<string[]>([]);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState('');
    const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [customTag, setCustomTag] = useState('');
    const [websiteLink, setWebsiteLink] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const resetForm = () => {
        setImages([]);
        setName('');
        setDescription('');
        setPrice('');
        setCategory('');
        setSelectedSizes([]);
        setSelectedTags([]);
        setCustomTag('');
        setWebsiteLink('');
    };

    const showImagePicker = () => {
        if (images.length >= 5) {
            Alert.alert('Maximum Images', 'You can add up to 5 images per product.');
            return;
        }

        Alert.alert(
            'Add Photo',
            'Choose how to add a photo',
            [
                {
                    text: 'Take Photo',
                    onPress: () => pickImage('camera'),
                },
                {
                    text: 'Choose from Gallery',
                    onPress: () => pickImage('gallery'),
                },
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
            ]
        );
    };

    const pickImage = async (source: 'camera' | 'gallery') => {
        // Request permissions
        if (source === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera access is required to take photos.');
                return;
            }
        }

        const result = source === 'camera'
            ? await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

        if (!result.canceled && result.assets[0]) {
            setImages([...images, result.assets[0].uri]);
        }
    };

    const removeImage = (index: number) => {
        setImages(images.filter((_, i) => i !== index));
    };

    const toggleSize = (size: string) => {
        if (selectedSizes.includes(size)) {
            setSelectedSizes(selectedSizes.filter(s => s !== size));
        } else {
            setSelectedSizes([...selectedSizes, size]);
        }
    };

    const handleCategorySelect = (cat: string) => {
        setCategory(cat);
        setSelectedSizes([]); // Reset sizes when category changes
    };

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    const addCustomTag = () => {
        const tag = customTag.trim();
        if (tag && !selectedTags.includes(tag)) {
            setSelectedTags([...selectedTags, tag]);
            setCustomTag('');
        }
    };

    const uploadImage = async (uri: string, index: number): Promise<string> => {
        const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64
        });

        const fileName = `products/${user?.id}/${Date.now()}_${index}.jpg`;
        const { data, error } = await supabase.storage
            .from('products')
            .upload(fileName, decode(base64), {
                contentType: 'image/jpeg',
            });

        if (error) throw error;

        const { data: urlData } = supabase.storage
            .from('products')
            .getPublicUrl(fileName);

        return urlData.publicUrl;
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            Alert.alert('Missing Name', 'Please enter a product name.');
            return;
        }
        if (images.length === 0) {
            Alert.alert('Missing Image', 'Please add at least one product image.');
            return;
        }
        if (!price || parseFloat(price) <= 0) {
            Alert.alert('Invalid Price', 'Please enter a valid price.');
            return;
        }
        if (!category) {
            Alert.alert('Missing Category', 'Please select a product category.');
            return;
        }
        if (selectedSizes.length === 0) {
            Alert.alert('Missing Sizes', 'Please select at least one size.');
            return;
        }

        setIsUploading(true);
        try {
            // Upload images
            const imageUrls: string[] = [];
            for (let i = 0; i < images.length; i++) {
                const url = await uploadImage(images[i], i);
                imageUrls.push(url);
            }

            // Create product record
            const { error } = await supabase.from('products').insert({
                seller_id: user?.id,
                name: name.trim(),
                description: description.trim(),
                price: parseFloat(price),
                category,
                sizes: selectedSizes,
                image_urls: imageUrls,
                tags: selectedTags.length > 0 ? selectedTags : null,
                external_links: websiteLink ? { website: websiteLink } : null,
                is_active: true,
            });

            if (error) throw error;

            Alert.alert('Success!', 'Your product has been listed.', [
                {
                    text: 'OK', onPress: () => {
                        resetForm();
                        onSuccess?.();
                        onClose();
                    }
                }
            ]);
        } catch (error) {
            console.error('Error uploading product:', error);
            Alert.alert('Upload Failed', 'There was an error listing your product. Please try again.');
        } finally {
            setIsUploading(false);
        }
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
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Feather name="x" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Add Product</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {/* Images */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PHOTOS</Text>
                        <View style={styles.imagesRow}>
                            {images.map((uri, index) => (
                                <View key={index} style={styles.imageContainer}>
                                    <Image source={{ uri }} style={styles.uploadedImage} contentFit="cover" />
                                    <Pressable style={styles.removeImageButton} onPress={() => removeImage(index)}>
                                        <Feather name="x" size={12} color="#fff" />
                                    </Pressable>
                                </View>
                            ))}
                            {images.length < 5 && (
                                <Pressable
                                    style={[styles.addImageButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                                    onPress={showImagePicker}
                                >
                                    <Feather name="plus" size={24} color={colors.textSecondary} />
                                </Pressable>
                            )}
                        </View>
                    </View>

                    {/* Category */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CATEGORY</Text>
                        <View style={styles.chipsRow}>
                            {CATEGORIES.map((cat) => (
                                <Pressable
                                    key={cat}
                                    style={[
                                        styles.chip,
                                        { backgroundColor: category === cat ? colors.primary : colors.backgroundSecondary }
                                    ]}
                                    onPress={() => handleCategorySelect(cat)}
                                >
                                    <Text style={[
                                        styles.chipText,
                                        { color: category === cat ? '#fff' : colors.text }
                                    ]}>
                                        {cat}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {/* Name */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PRODUCT NAME</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                            value={name}
                            onChangeText={setName}
                            placeholder="e.g., Vintage Nike Windbreaker"
                            placeholderTextColor={colors.placeholder}
                        />
                    </View>

                    {/* Price */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PRICE</Text>
                        <View style={[styles.priceInputContainer, { backgroundColor: colors.backgroundSecondary }]}>
                            <Text style={[styles.dollarSign, { color: colors.text }]}>$</Text>
                            <TextInput
                                style={[styles.priceInput, { color: colors.text }]}
                                value={price}
                                onChangeText={setPrice}
                                placeholder="0.00"
                                placeholderTextColor={colors.placeholder}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>

                    {/* Sizes */}
                    {category ? (
                        <View style={styles.section}>
                            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                                SIZES ({category === 'Shoes' ? 'US Men\'s' : category === 'Bottoms' ? 'Waist' : 'Standard'})
                            </Text>
                            <View style={styles.chipsRow}>
                                {SIZE_MAPPING[category].map((size) => (
                                    <Pressable
                                        key={size}
                                        style={[
                                            styles.chip,
                                            { backgroundColor: selectedSizes.includes(size) ? colors.primary : colors.backgroundSecondary }
                                        ]}
                                        onPress={() => toggleSize(size)}
                                    >
                                        <Text style={[
                                            styles.chipText,
                                            { color: selectedSizes.includes(size) ? '#fff' : colors.text }
                                        ]}>
                                            {size}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    ) : null}

                    {/* Description */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>DESCRIPTION</Text>
                        <TextInput
                            style={[styles.textArea, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Describe your product..."
                            placeholderTextColor={colors.placeholder}
                            multiline
                            numberOfLines={4}
                        />
                    </View>

                    {/* Tags */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>TAGS</Text>
                        <View style={styles.chipsRow}>
                            {SUGGESTED_TAGS.map((tag) => (
                                <Pressable
                                    key={tag}
                                    style={[
                                        styles.tagChip,
                                        {
                                            backgroundColor: selectedTags.includes(tag) ? colors.primary + '20' : colors.backgroundSecondary,
                                            borderColor: selectedTags.includes(tag) ? colors.primary : 'transparent',
                                        }
                                    ]}
                                    onPress={() => toggleTag(tag)}
                                >
                                    <Text style={[
                                        styles.tagChipText,
                                        { color: selectedTags.includes(tag) ? colors.primary : colors.textSecondary }
                                    ]}>
                                        #{tag}
                                    </Text>
                                </Pressable>
                            ))}
                            {/* Display Custom Tags */}
                            {selectedTags.filter(t => !SUGGESTED_TAGS.includes(t)).map((tag) => (
                                <Pressable
                                    key={tag}
                                    style={[
                                        styles.tagChip,
                                        {
                                            backgroundColor: colors.primary + '20',
                                            borderColor: colors.primary,
                                        }
                                    ]}
                                    onPress={() => toggleTag(tag)}
                                >
                                    <Text style={[styles.tagChipText, { color: colors.primary }]}>#{tag}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                            <TextInput
                                style={[styles.input, { flex: 1, backgroundColor: colors.backgroundSecondary, color: colors.text, paddingVertical: 10 }]}
                                value={customTag}
                                onChangeText={setCustomTag}
                                placeholder="Add custom tag..."
                                placeholderTextColor={colors.placeholder}
                                onSubmitEditing={addCustomTag}
                                returnKeyType="done"
                            />
                            <Pressable
                                onPress={addCustomTag}
                                style={{
                                    justifyContent: 'center',
                                    paddingHorizontal: 16,
                                    backgroundColor: colors.backgroundSecondary,
                                    borderRadius: 10
                                }}
                            >
                                <Feather name="plus" size={20} color={colors.text} />
                            </Pressable>
                        </View>
                    </View>

                    {/* External Link */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>WEBSITE LINK (OPTIONAL)</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                            value={websiteLink}
                            onChangeText={setWebsiteLink}
                            placeholder="https://..."
                            placeholderTextColor={colors.placeholder}
                            keyboardType="url"
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Submit Button */}
                <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    <Pressable
                        style={[styles.submitButton, { backgroundColor: colors.primary }, isUploading && styles.submitButtonDisabled]}
                        onPress={handleSubmit}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Feather name="check" size={20} color="#fff" />
                                <Text style={styles.submitButtonText}>List Product</Text>
                            </>
                        )}
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

// Helper to decode base64 to Uint8Array for upload
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
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
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
    content: {
        flex: 1,
    },
    section: {
        padding: 16,
        gap: 10,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    imagesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    imageContainer: {
        width: 80,
        height: 80,
        borderRadius: 8,
        overflow: 'hidden',
    },
    uploadedImage: {
        width: '100%',
        height: '100%',
    },
    removeImageButton: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addImageButton: {
        width: 80,
        height: 80,
        borderRadius: 8,
        borderWidth: 2,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    input: {
        borderRadius: 10,
        padding: 14,
        fontSize: 16,
    },
    priceInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        paddingHorizontal: 14,
    },
    dollarSign: {
        fontSize: 16,
        fontWeight: '600',
        marginRight: 4,
    },
    priceInput: {
        flex: 1,
        paddingVertical: 14,
        fontSize: 16,
    },
    textArea: {
        borderRadius: 10,
        padding: 14,
        fontSize: 16,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
    },
    chipText: {
        fontSize: 14,
        fontWeight: '600',
    },
    tagChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
    },
    tagChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    footer: {
        padding: 16,
        paddingBottom: 32,
        borderTopWidth: 1,
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        gap: 8,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
});
