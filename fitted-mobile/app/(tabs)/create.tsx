import { StyleSheet, TextInput, Pressable, Alert, ActivityIndicator, Dimensions, Keyboard, TouchableWithoutFeedback, ScrollView, View as RNView, Modal } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView, FlatList } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
// Removed: import { BlurView } from 'expo-blur'; - unused in snippet

import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import { BACKGROUND_OPTIONS, DEFAULT_BACKGROUND, BackgroundOption, POLAROID_FRAME } from '@/constants/backgrounds';
import CropModal from '@/components/CropModal';
import ProductSearchModal from '@/components/ProductSearchModal';
import FolderCarousel from '@/components/FolderCarousel';
import AssetGrid from '@/components/AssetGrid';
import { Product, generateOutfit, searchProducts } from '@/services/aiService';
import { Asset, useWardrobeStore } from '@/stores/wardrobeStore';
import { useTheme } from '@/hooks/useTheme';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Removed legacy shared component import that might conflict if not used exactly as before

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_WIDTH = SCREEN_WIDTH; // Full width, edge-to-edge
const ITEM_WIDTH = (SCREEN_WIDTH - 48) / 2; // 2 columns with padding (same as modal)

/**
 * Get product image URL using Bing Image Search (same as modal)
 */
function getProductImageUrl(product: Product): string {
    const searchTerm = `${product.brand} ${product.name} sneaker`;
    return `https://tse2.mm.bing.net/th?q=${encodeURIComponent(searchTerm)}&w=500&h=500&c=7&rs=1&p=0`;
}

// Placeholder music tracks for selection (to be replaced with API)
interface MusicTrack {
    id: string;
    name: string;
    artist: string;
    duration: string;
    previewUrl?: string; // For future audio playback
}

const PLACEHOLDER_MUSIC_TRACKS: MusicTrack[] = [
    { id: '1', name: 'No Music', artist: 'Silent', duration: '0:00' },
    { id: '2', name: 'Trending Beat', artist: 'Popular Artist', duration: '0:30' },
    { id: '3', name: 'Fashion Forward', artist: 'Style Beats', duration: '0:30' },
    { id: '4', name: 'Street Vibes', artist: 'Urban Sound', duration: '0:30' },
    { id: '5', name: 'Luxury Life', artist: 'High Fashion', duration: '0:30' },
    { id: '6', name: 'Chill Mode', artist: 'Relaxed Fits', duration: '0:30' },
];

interface CanvasItem {
    id: string;
    url: string;
    originalUrl: string; // Keep original for re-cropping
    x: number; // pixels
    y: number; // pixels
    usePolaroid: boolean; // Show in polaroid frame (default true)
    purchaseLink?: string; // StockX or custom link
    itemName?: string; // Product name (full name)
    brand?: string; // Brand name (separate for proper multi-word brands)
    scale: number;
    rotation: number;
}

// --- DRAGGABLE IMAGE COMPONENT ---
// Draggable Image Component with Pan, Pinch, and Rotate
// Rotation only enabled when in polaroid frame
function DraggableImage({
    item,
    onRemove,
    onCrop,
    onTogglePolaroid,
    onUpdate,
    hideControls = false
}: {
    item: CanvasItem;
    onRemove: () => void;
    onCrop: () => void;
    onTogglePolaroid: () => void;
    onUpdate: (id: string, updates: Partial<CanvasItem>) => void;
    hideControls?: boolean;
}) {
    const translateX = useSharedValue(item.x);
    const translateY = useSharedValue(item.y);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);
    const scale = useSharedValue(item.scale);
    const savedScale = useSharedValue(item.scale);
    const rotation = useSharedValue(item.rotation);
    const savedRotation = useSharedValue(item.rotation);

    // Pan gesture for dragging - maxPointers(1) ensures only ONE item can be moved at a time
    const panGesture = Gesture.Pan()
        .maxPointers(1)
        .onBegin(() => {
            offsetX.value = translateX.value;
            offsetY.value = translateY.value;
        })
        .onChange((event) => {
            translateX.value = offsetX.value + event.translationX;
            translateY.value = offsetY.value + event.translationY;
        })
        .onFinalize(() => {
            translateX.value = withSpring(translateX.value);
            translateY.value = withSpring(translateY.value);
            runOnJS(onUpdate)(item.id, { x: translateX.value, y: translateY.value });
        });

    // Pinch gesture for scaling
    const pinchGesture = Gesture.Pinch()
        .onUpdate((event) => {
            scale.value = savedScale.value * event.scale;
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            runOnJS(onUpdate)(item.id, { scale: scale.value });
        });

    // Rotation gesture - only enabled when in polaroid frame
    const rotationGesture = Gesture.Rotation()
        .onUpdate((event) => {
            if (item.usePolaroid) {
                rotation.value = savedRotation.value + event.rotation;
            }
        })
        .onEnd(() => {
            if (item.usePolaroid) {
                savedRotation.value = rotation.value;
                runOnJS(onUpdate)(item.id, { rotation: rotation.value });
            }
        });

    // Compose all gestures to work simultaneously
    const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
            { rotate: `${rotation.value}rad` },
        ],
    }));

    // Size adjustments for polaroid frame
    const ITEM_SIZE = 150;
    const POLAROID_SIZE = 180; // Slightly larger to accommodate frame
    const IMAGE_INSET = 25; // Inset for image inside polaroid frame
    const IMAGE_DIMENSION = POLAROID_SIZE - (IMAGE_INSET * 2);

    return (
        <GestureDetector gesture={composedGesture}>
            <Animated.View
                collapsable={false}
                style={[styles.canvasItem, animatedStyle, { width: item.usePolaroid ? POLAROID_SIZE : ITEM_SIZE, height: item.usePolaroid ? POLAROID_SIZE : ITEM_SIZE }]}
            >
                {item.usePolaroid ? (
                    // Polaroid frame with image inside
                    <View style={{ width: POLAROID_SIZE, height: POLAROID_SIZE }}>
                        {/* Image renders first (behind) */}
                        <View style={{
                            position: 'absolute',
                            top: IMAGE_INSET,
                            left: IMAGE_INSET,
                            width: IMAGE_DIMENSION,
                            height: IMAGE_DIMENSION,
                            overflow: 'hidden'
                        }}>
                            <Image
                                source={{ uri: item.url }}
                                style={{ width: '100%', height: '100%' }}
                                contentFit="cover"
                            />
                        </View>
                        {/* Frame renders second (on top with transparent center) */}
                        <Image
                            source={POLAROID_FRAME}
                            style={{ position: 'absolute', width: '100%', height: '100%' }}
                            contentFit="contain"
                        />
                    </View>
                ) : (
                    // Plain image without frame
                    <Image
                        source={{ uri: item.url }}
                        style={[
                            styles.canvasItemImage,
                            hideControls && { borderWidth: 0, borderRadius: 0 }
                        ]}
                        contentFit="contain"
                    />
                )}

                {/* Control buttons - hidden during capture */}
                {!hideControls && (
                    <>
                        <Pressable style={styles.cropItemButton} onPress={onCrop}>
                            <Feather name="crop" size={14} color="#fff" />
                        </Pressable>
                        <Pressable style={styles.removeItemButton} onPress={onRemove}>
                            <Feather name="x" size={14} color="#fff" />
                        </Pressable>
                        {/* Polaroid toggle button */}
                        <Pressable
                            style={[styles.polaroidToggleButton, item.usePolaroid && styles.polaroidToggleActive]}
                            onPress={onTogglePolaroid}
                        >
                            <Feather name={item.usePolaroid ? "check-square" : "square"} size={14} color="#fff" />
                        </Pressable>
                    </>
                )}
            </Animated.View>
        </GestureDetector >
    );
}

// Step Indicator Component
function StepIndicator({ currentStep, colors }: { currentStep: number; colors: any }) {
    const steps = ['Upload', 'Canvas', 'Preview'];
    return (
        <View style={stepStyles.container}>
            {steps.map((label, index) => {
                const stepNum = index + 1;
                const isActive = stepNum === currentStep;
                const isCompleted = stepNum < currentStep;
                return (
                    <View key={label} style={stepStyles.stepItem}>
                        <View style={[
                            stepStyles.dot,
                            { borderColor: colors.border },
                            isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
                            isCompleted && { backgroundColor: colors.primary, borderColor: colors.primary }
                        ]}>
                            {isCompleted && <Feather name="check" size={12} color="#fff" />}
                        </View>
                        <Text style={[
                            stepStyles.label,
                            { color: isActive || isCompleted ? colors.text : colors.textTertiary }
                        ]}>{label}</Text>
                    </View>
                );
            })}
        </View>
    );
}

// ... imports ...
import { decode } from 'base64-arraybuffer';
import { usePostsStore } from '@/stores/postsStore';

// ... existing code ...

export default function CreateScreen() {
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);

    // Step state (1 = Build, 2 = Preview)
    const [currentStep, setCurrentStep] = useState(1);

    const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);
    const [selectedBackground, setSelectedBackground] = useState<BackgroundOption>(DEFAULT_BACKGROUND);
    const [cropItem, setCropItem] = useState<CanvasItem | null>(null);
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [facePhotoUri, setFacePhotoUri] = useState<string | null>(null);

    // NEW: Upload/Search toggle (for top tabs)
    const [uploadMode, setUploadMode] = useState<'upload' | 'search'>('upload');

    // Inline search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    // NEW: Items/Canvas tab switcher (bottom section)
    const [bottomTab, setBottomTab] = useState<'items' | 'canvas'>('items');

    // NEW: Scene/prompt description
    const [sceneDescription, setSceneDescription] = useState('');

    // NEW: Keep frames toggle
    const [keepFrames, setKeepFrames] = useState(true);

    // NEW: Music track (placeholder)
    const [musicTrack, setMusicTrack] = useState<string | null>(null);

    // NEW: Item links for each canvas item
    const [itemLinks, setItemLinks] = useState<{
        [itemId: string]: { brand: string; name: string; price: string; url: string }
    }>({});

    // Social sharing toggles
    const [shareToInstagram, setShareToInstagram] = useState(false);
    const [shareToTikTok, setShareToTikTok] = useState(false);
    const [shareToTwitter, setShareToTwitter] = useState(false);

    // AI Generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImageUri, setGeneratedImageUri] = useState<string | null>(null);
    const [capturedBoardUri, setCapturedBoardUri] = useState<string | null>(null);

    // Preview carousel state
    const [previewSlide, setPreviewSlide] = useState(0);

    // Capture state - used to hide control buttons during board capture
    const [isCapturing, setIsCapturing] = useState(false);

    // Music modal state
    const [showMusicModal, setShowMusicModal] = useState(false);
    const [musicSearchQuery, setMusicSearchQuery] = useState('');

    // Ref for capturing canvas as image
    const canvasRef = useRef<RNView>(null);

    // Wardrobe store action
    const addAssetToWardrobe = useWardrobeStore((state) => state.addAsset);
    const createPost = usePostsStore((state) => state.createPost);

    // Camera Permissions
    const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();

    const handleTakePicture = async () => {
        if (!cameraPermission?.granted) {
            const permission = await requestCameraPermission();
            if (!permission.granted) {
                Alert.alert('Permission needed', 'Camera permission is required to take photos.');
                return;
            }
        }

        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                // mediaTypes: ImagePicker.MediaTypeOptions.Images, // Legacy
                quality: 0.8,
                allowsEditing: true, // Recommended for "cropping" feeling immediately
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];

                // Fix orientation by re-saving via manipulator
                const manipResult = await ImageManipulator.manipulateAsync(
                    asset.uri,
                    [],
                    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                );

                // Add to canvas
                const newItem: CanvasItem = {
                    id: Date.now().toString(),
                    url: manipResult.uri,
                    originalUrl: manipResult.uri,
                    x: 50,
                    y: 50,
                    scale: 1,
                    rotation: 0,
                    usePolaroid: true,
                };

                setCanvasItems((prev) => [...prev, newItem]);

                // Automatically switch to upload mode/view
                setUploadMode('upload');
            }
        } catch (error) {
            console.error('Camera error:', error);
            Alert.alert('Error', 'Failed to take photo');
        }
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera roll permissions');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            // Add to canvas at center - store original URL for re-cropping
            const newItem: CanvasItem = {
                id: Date.now().toString(),
                url: result.assets[0].uri,
                originalUrl: result.assets[0].uri, // Keep original
                x: CANVAS_WIDTH / 2 - 75,
                y: 150,
                usePolaroid: true, // Default to polaroid frame
                scale: 1,
                rotation: 0,
            };
            setCanvasItems([...canvasItems, newItem]);

            // Auto-save to wardrobe "Last Used"
            addAssetToWardrobe('last_used', { url: result.assets[0].uri });
        }
    };

    const pickFacePhoto = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera roll permissions');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            setFacePhotoUri(result.assets[0].uri);
        }
    };

    const goToNextStep = () => {
        if (currentStep < 2) {
            setCurrentStep(currentStep + 1);
        }
    };

    const goToPrevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const resetWorkflow = () => {
        setCurrentStep(1);
        setCanvasItems([]);
        setCaption('');
        setFacePhotoUri(null);
        setSceneDescription('');
        setUploadMode('upload');
        setBottomTab('items');
        setKeepFrames(true);
        setMusicTrack(null);
        setItemLinks({});
        setShareToInstagram(false);
        setShareToTikTok(false);
        setShareToTwitter(false);
        setGeneratedImageUri(null);
        setCapturedBoardUri(null);
        setPreviewSlide(0);
    };

    // Convert image URI to base64
    const imageToBase64 = async (uri: string): Promise<string> => {
        try {
            // Handle remote URLs
            if (uri.startsWith('http://') || uri.startsWith('https://')) {
                // Generate a unique filename to avoid issues with query strings in URLs
                const filename = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                const fileUri = `${FileSystem.cacheDirectory}${filename}`;
                const downloadResult = await FileSystem.downloadAsync(uri, fileUri);

                if (downloadResult.status !== 200) {
                    throw new Error(`Failed to download image: status ${downloadResult.status}`);
                }

                const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                return `data:image/jpeg;base64,${base64}`;
            }
            // Handle local file URIs
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            return `data:image/jpeg;base64,${base64}`;
        } catch (error) {
            console.error('Base64 conversion error:', error);
            throw error;
        }
    };

    // Handle AI outfit generation
    const handleGenerateOutfit = async () => {
        if (canvasItems.length === 0) {
            Alert.alert('Error', 'Please add at least one clothing item');
            return;
        }

        // 1. Capture board image FIRST (while canvas is fully visible & interactive)
        // We do this before setting isGenerating(true) to avoid capturing the loading overlay
        try {
            if (canvasRef.current && canvasItems.length > 0) {
                // Hide control buttons for clean capture
                setIsCapturing(true);

                // Wait for re-render to hide buttons
                await new Promise(resolve => setTimeout(resolve, 200));

                const boardUri = await captureRef(canvasRef, {
                    format: 'jpg',
                    quality: 0.9,
                    result: 'tmpfile',
                });

                console.log('Board captured successfully:', boardUri);
                setCapturedBoardUri(boardUri);

                // Restore buttons
                setIsCapturing(false);
            }
        } catch (captureError) {
            console.warn('Could not capture board image:', captureError);
            setIsCapturing(false);
            // We continue even if capture fails, to at least get the outfit
        }

        setIsGenerating(true);

        try {
            // Convert face photo to base64 (optional)
            let faceBase64: string | null = null;
            if (facePhotoUri) {
                faceBase64 = await imageToBase64(facePhotoUri);
            }

            // Convert all canvas items to base64
            const clothingBase64s = await Promise.all(
                canvasItems.map(item => imageToBase64(item.url))
            );

            // Get background description for prompt - prioritization:
            // 1. Explicit scene description from user
            // 2. Selected background name (if not simple color)
            // 3. Default fallback
            const bgPrompt = sceneDescription && sceneDescription.trim().length > 0
                ? sceneDescription
                : (selectedBackground.name !== 'Plain Black' ? selectedBackground.name : 'a clean, neutral studio background');

            // Call AI generation
            const generatedImage = await generateOutfit(faceBase64, clothingBase64s, bgPrompt);

            // Store result and move to preview
            // generatedImage is already a data URI
            setGeneratedImageUri(generatedImage);
            setCurrentStep(2);

            Alert.alert('Success', 'Outfit generated! Review and publish.');
        } catch (error: any) {
            console.error('Generation failed:', error);
            Alert.alert('Generation Failed', error.message || 'Could not generate outfit. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const removeItem = (id: string) => {
        setCanvasItems(canvasItems.filter((item) => item.id !== id));
    };

    // Open crop modal for existing image
    const handleCropItem = (item: CanvasItem) => {
        setCropItem(item);
    };

    const handleCropComplete = (croppedUri: string) => {
        if (cropItem) {
            setCanvasItems(canvasItems.map((i) =>
                i.id === cropItem.id ? { ...i, url: croppedUri } : i
            ));
        }
        setCropItem(null);
    };

    // Add product from search to canvas + save to wardrobe
    const handleProductSelect = (product: Product) => {
        // Use Bing Image Search for product images as fallback if needed, but product.imageUrl should be preferred if good
        let imgUrl = product.imageUrl;
        if (!imgUrl) {
            const searchTerm = `${product.brand} ${product.name} sneaker`;
            imgUrl = `https://tse2.mm.bing.net/th?q=${encodeURIComponent(searchTerm)}&w=800&h=800&c=7&rs=1&p=0`;
        }

        const newItem: CanvasItem = {
            id: Date.now().toString(),
            url: imgUrl,
            originalUrl: imgUrl,
            x: CANVAS_WIDTH / 2 - 75,
            y: 150,
            usePolaroid: true, // Default to polaroid frame
            purchaseLink: product.purchaseLink,
            itemName: product.name, // Just the product name
            brand: product.brand, // Store brand separately for multi-word brands
            scale: 1,
            rotation: 0,
        };
        setCanvasItems([...canvasItems, newItem]);
        setShowProductSearch(false);

        // Switch to upload mode after selecting product
        setUploadMode('upload');
        setSearchQuery('');
        setSearchResults([]);
        setHasSearched(false);

        // Auto-save to wardrobe "Last Used"
        addAssetToWardrobe('last_used', {
            url: imgUrl,
            brand: product.brand,
            itemName: product.name,
            purchaseLink: product.purchaseLink,
        });
    };

    // Recent searches constants
    const RECENT_SEARCHES_KEY = 'fitted_recent_product_searches';
    const MAX_RECENT_SEARCHES = 8;

    // Load recent searches on mount
    useEffect(() => {
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
        loadRecentSearches();
    }, []);

    // Save recent search
    const saveRecentSearch = async (query: string) => {
        try {
            const trimmed = query.trim().toLowerCase();
            const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
            setRecentSearches(updated);
            await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        } catch (error) {
            console.error('Failed to save recent search:', error);
        }
    };

    // Clear recent searches
    const clearRecentSearches = async () => {
        try {
            setRecentSearches([]);
            await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
        } catch (error) {
            console.error('Failed to clear recent searches:', error);
        }
    };

    // Inline search handler
    const handleInlineSearch = async (query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        setSearchLoading(true);
        setHasSearched(true);
        try {
            const results = await searchProducts(query);
            setSearchResults(results);
            await saveRecentSearch(query);
        } catch (error) {
            console.error('Search error:', error);
            setSearchResults([]);
        } finally {
            setSearchLoading(false);
        }
    };

    // Handle recent search tap
    const handleRecentSearchTap = (term: string) => {
        setSearchQuery(term);
        handleInlineSearch(term);
    };

    // Add asset from wardrobe to canvas - restore product data if available
    const handleAssetSelect = (asset: Asset) => {
        const newItem: CanvasItem = {
            id: Date.now().toString(),
            url: asset.url,
            originalUrl: asset.url,
            x: CANVAS_WIDTH / 2 - 75,
            y: 150,
            usePolaroid: true, // Default to polaroid frame
            scale: 1,
            rotation: 0,
            // Restore product data from wardrobe
            brand: asset.brand,
            itemName: asset.itemName,
            purchaseLink: asset.purchaseLink,
        };
        setCanvasItems([...canvasItems, newItem]);
    };

    // Toggle polaroid frame for an item
    const togglePolaroid = (itemId: string) => {
        setCanvasItems(canvasItems.map((item) =>
            item.id === itemId ? { ...item, usePolaroid: !item.usePolaroid } : item
        ));
    };

    const handleUpdateItem = (id: string, updates: Partial<CanvasItem>) => {
        setCanvasItems(items => items.map(item =>
            item.id === id ? { ...item, ...updates } : item
        ));
    };

    const uploadImage = async (uri: string): Promise<string | null> => {
        if (!uri) {
            console.warn('uploadImage called with empty URI');
            return null;
        }

        // Truncate log for long data URIs
        const logUri = uri.length > 100 ? `${uri.substring(0, 100)}...` : uri;
        console.log('Uploading image from URI:', logUri);

        try {
            let arrayBuffer: ArrayBuffer;

            // Check if this is a remote URL
            if (uri.startsWith('http')) {
                const response = await fetch(uri);
                const blob = await response.blob();
                arrayBuffer = await new Response(blob).arrayBuffer();
            }
            // Check if this is a Data URI (base64)
            else if (uri.startsWith('data:')) {
                const base64Data = uri.split(',')[1];
                const { decode } = require('base64-arraybuffer');
                arrayBuffer = decode(base64Data);
            }
            // Local file
            else {
                // Local file - verify it exists
                const fileInfo = await FileSystem.getInfoAsync(uri);
                if (!fileInfo.exists) {
                    throw new Error(`File not found at ${logUri}`);
                }

                const base64Data = await FileSystem.readAsStringAsync(uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                const { decode } = require('base64-arraybuffer');
                arrayBuffer = decode(base64Data);
            }

            const fileName = `${user?.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const { data, error } = await supabase.storage
                .from('posts')
                .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });

            if (error) throw error;

            const { data: urlData } = supabase.storage.from('posts').getPublicUrl(fileName);
            return urlData.publicUrl;
        } catch (error) {
            console.error('Upload error:', error);
            // If it fails, return the original URI if it was remote? No, return null.
            return null;
        }
    };

    const handlePublish = async () => {
        if (!user) {
            Alert.alert('Error', 'Please sign in to post');
            return;
        }

        // Use generated image if available, otherwise use first canvas item
        const imageToUpload = generatedImageUri || canvasItems[0]?.url;
        if (!imageToUpload) {
            Alert.alert('Error', 'No image to publish');
            return;
        }

        setUploading(true);

        try {
            // Upload the generated/selected image
            const imageUrl = await uploadImage(imageToUpload);

            if (!imageUrl) {
                Alert.alert('Error', 'Failed to upload image');
                setUploading(false);
                return;
            }

            // Capture and upload board image if we have canvas items
            let boardImageUrl: string | null = null;
            if (capturedBoardUri) {
                try {
                    boardImageUrl = await uploadImage(capturedBoardUri);
                } catch (captureError) {
                    console.warn('Could not upload board image:', captureError);
                }
            }

            // Build items array with canvas_state positions
            const itemsWithPositions = canvasItems.map((item) => ({
                id: item.id,
                brand: item.brand || 'Unknown',
                name: item.itemName || 'Item',
                price: 0,
                image_url: item.url,
                purchase_link: item.purchaseLink || '',
                canvas_state: {
                    x: item.x,
                    y: item.y,
                    rotation: item.rotation,
                    scale: item.scale,
                    is_bg_removed: false,
                },
            }));

            // Create post with both images and items
            const { error } = await createPost({
                user_id: user.id,
                generated_image: imageUrl,
                board_image: boardImageUrl || undefined,
                caption: caption.trim(),
                items: itemsWithPositions,
                background_config: {
                    type: selectedBackground.type,
                    value: selectedBackground.color,
                    id: selectedBackground.id,
                },
            });

            if (error) {
                // If it's a string error from store
                throw new Error(typeof error === 'string' ? error : (error as any).message);
            }

            // Success - reset and go back
            resetWorkflow();
            Alert.alert('Success', 'Your fit has been posted!');
            router.push('/(tabs)');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to create post');
        } finally {
            setUploading(false);
        }
    };

    // Update item link data
    const updateItemLink = (itemId: string, field: 'brand' | 'name' | 'price' | 'url', value: string) => {
        setItemLinks(prev => ({
            ...prev,
            [itemId]: {
                ...prev[itemId] || { brand: '', name: '', price: '', url: '' },
                [field]: value
            }
        }));
    };

    return (
        <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    {/* Header */}
                    <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                        <View style={styles.headerLeft}>
                            <Text style={[styles.headerTitle, { color: colors.text }]}>
                                {currentStep === 1 ? 'BUILD FIT' : 'PREVIEW POST'}
                            </Text>
                        </View>
                        <Pressable onPress={resetWorkflow}>
                            <Text style={[styles.resetText, { color: colors.textSecondary }]}>Reset</Text>
                        </Pressable>
                    </View>

                    {/* STEP 1: Build Fit */}
                    {currentStep === 1 && !isGenerating && (
                        <ScrollView
                            style={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={styles.scrollContentContainer}
                        >
                            {/* Face & Scene Row - appears when items on canvas */}
                            {canvasItems.length > 0 && (
                                <View style={styles.faceSceneRow}>
                                    {/* Face Upload Section */}
                                    {facePhotoUri ? (
                                        <View style={[styles.faceChip, { backgroundColor: '#F3E8FF' }]}>
                                            <Image source={{ uri: facePhotoUri }} style={styles.faceChipImage} />
                                            <Pressable onPress={() => setFacePhotoUri(null)} style={styles.faceChipRemove}>
                                                <Feather name="x" size={12} color="#fff" />
                                            </Pressable>
                                        </View>
                                    ) : (
                                        <Pressable style={[styles.faceUploadButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={pickFacePhoto}>
                                            <Feather name="user" size={24} color={colors.textSecondary} />
                                            <Text style={[styles.faceUploadText, { color: colors.textSecondary }]}>Add Face</Text>
                                        </Pressable>
                                    )}

                                    {/* Scene Description Input */}
                                    <TextInput
                                        style={[styles.sceneInputFlex, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]}
                                        placeholder="Describe scene (e.g. 'Standing in NYC')"
                                        placeholderTextColor={colors.placeholder}
                                        value={sceneDescription}
                                        onChangeText={setSceneDescription}
                                        multiline
                                    />
                                </View>
                            )}

                            {/* Upload / Search Toggle */}
                            {canvasItems.length === 0 && !facePhotoUri && (
                                <View style={styles.toggleContainer}>
                                    <Pressable
                                        style={[styles.toggleButton, uploadMode === 'upload' && styles.toggleButtonActive]}
                                        onPress={() => setUploadMode('upload')}
                                    >
                                        <Text style={[styles.toggleText, uploadMode === 'upload' && styles.toggleTextActive]}>Upload</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.toggleButton, uploadMode === 'search' && styles.toggleButtonActive]}
                                        onPress={() => setUploadMode('search')}
                                    >
                                        <Text style={[styles.toggleText, uploadMode === 'search' && styles.toggleTextActive]}>Search</Text>
                                    </Pressable>
                                </View>
                            )}

                            {/* Canvas Area - show when upload mode OR has items */}
                            {(uploadMode === 'upload' || canvasItems.length > 0) && (
                                <View style={styles.canvasContainer}>
                                    <RNView
                                        ref={canvasRef}
                                        collapsable={false}
                                        style={[
                                            styles.canvas,
                                            selectedBackground.type === 'color' && { backgroundColor: selectedBackground.color },
                                            canvasItems.length === 0 && styles.canvasEmpty
                                        ]}>
                                        {/* Background image if selected */}
                                        {selectedBackground.type === 'image' && selectedBackground.imageSource && (
                                            <Image
                                                source={selectedBackground.imageSource}
                                                style={styles.canvasBackgroundImage}
                                                contentFit="cover"
                                            />
                                        )}

                                        {/* Canvas items */}
                                        {canvasItems.map((item) => (
                                            <DraggableImage
                                                key={item.id}
                                                item={item}
                                                onRemove={() => removeItem(item.id)}
                                                onCrop={() => handleCropItem(item)}
                                                onTogglePolaroid={() => togglePolaroid(item.id)}
                                                onUpdate={handleUpdateItem}
                                                hideControls={isCapturing}
                                            />
                                        ))}

                                        {/* Empty State - Tap to Upload */}
                                        {canvasItems.length === 0 && (
                                            <View style={styles.emptyStateContainer}>
                                                <Text style={[styles.emptySubtext, { marginBottom: 32 }]}>Start your fit check</Text>

                                                <View style={{ flexDirection: 'row', gap: 24 }}>
                                                    <Pressable style={{ alignItems: 'center' }} onPress={pickImage}>
                                                        <View style={styles.uploadCircle}>
                                                            <Feather name="image" size={32} color="#999" />
                                                        </View>
                                                        <Text style={styles.emptyText}>Upload</Text>
                                                    </Pressable>

                                                    <Pressable style={{ alignItems: 'center' }} onPress={handleTakePicture}>
                                                        <View style={styles.uploadCircle}>
                                                            <Feather name="camera" size={32} color="#999" />
                                                        </View>
                                                        <Text style={styles.emptyText}>Camera</Text>
                                                    </Pressable>
                                                </View>
                                            </View>
                                        )}
                                    </RNView>

                                    {/* Floating Action Buttons (when items exist) */}
                                    {canvasItems.length > 0 && (
                                        <View style={styles.floatingActions}>
                                            <Pressable style={[styles.floatingButton, { backgroundColor: '#fff' }]} onPress={() => setShowProductSearch(true)}>
                                                <Feather name="search" size={20} color="#000" />
                                            </Pressable>
                                            <Pressable style={[styles.floatingButton, { backgroundColor: '#fff' }]} onPress={handleTakePicture}>
                                                <Feather name="camera" size={20} color="#000" />
                                            </Pressable>
                                            <Pressable style={[styles.floatingButton, { backgroundColor: '#000' }]} onPress={pickImage}>
                                                <Feather name="plus" size={20} color="#fff" />
                                            </Pressable>
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Inline Search UI - show when search mode AND no items */}
                            {uploadMode === 'search' && canvasItems.length === 0 && (
                                <View style={[styles.canvasContainer, { backgroundColor: colors.background }]}>
                                    <View style={{ padding: 16, gap: 16 }}>
                                        {/* Search Input */}
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <TextInput
                                                style={[styles.linkInput, { flex: 1, borderColor: colors.border, color: colors.text }]}
                                                placeholder="Search for products..."
                                                placeholderTextColor={colors.placeholder}
                                                value={searchQuery}
                                                onChangeText={setSearchQuery}
                                                onSubmitEditing={() => handleInlineSearch(searchQuery)}
                                                returnKeyType="search"
                                            />
                                            <Pressable
                                                style={[styles.addUrlButton, { backgroundColor: colors.primary }]}
                                                onPress={() => handleInlineSearch(searchQuery)}
                                            >
                                                <Feather name="search" size={18} color="#fff" />
                                            </Pressable>
                                        </View>

                                        {/* Search Results / Recent Searches / Empty State */}
                                        {searchLoading ? (
                                            <View style={{ alignItems: 'center', paddingTop: 40 }}>
                                                <ActivityIndicator size="large" color={colors.primary} />
                                                <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Searching...</Text>
                                            </View>
                                        ) : searchResults.length > 0 ? (
                                            /* Search Results - 2 column grid matching modal exactly */
                                            <View style={styles.searchResultsGrid}>
                                                {searchResults.map((item, index) => (
                                                    <Pressable
                                                        key={`${item.name}-${index}`}
                                                        style={[styles.productCard, { backgroundColor: colors.backgroundSecondary }]}
                                                        onPress={() => handleProductSelect(item)}
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
                                                        <View style={[styles.productAddButton, { backgroundColor: colors.primary }]}>
                                                            <Feather name="plus" size={16} color="#fff" />
                                                        </View>
                                                    </Pressable>
                                                ))}
                                            </View>
                                        ) : hasSearched ? (
                                            /* No results */
                                            <View style={{ alignItems: 'center', paddingTop: 40 }}>
                                                <Feather name="search" size={48} color={colors.textSecondary} />
                                                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16, marginTop: 12 }}>No products found</Text>
                                                <Text style={{ color: colors.textSecondary, marginTop: 4 }}>Try a different search term</Text>
                                            </View>
                                        ) : (
                                            /* Initial state - Recent searches + placeholder */
                                            <View>
                                                {recentSearches.length > 0 && (
                                                    <View style={{ marginBottom: 20 }}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                                                            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>Recent Searches</Text>
                                                            <Pressable onPress={clearRecentSearches}>
                                                                <Text style={{ color: colors.primary, fontSize: 14 }}>Clear</Text>
                                                            </Pressable>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                            {recentSearches.map((term, index) => (
                                                                <Pressable
                                                                    key={`${term}-${index}`}
                                                                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundSecondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 }}
                                                                    onPress={() => handleRecentSearchTap(term)}
                                                                >
                                                                    <Feather name="clock" size={14} color={colors.textSecondary} />
                                                                    <Text style={{ color: colors.text, fontSize: 14 }}>{term}</Text>
                                                                </Pressable>
                                                            ))}
                                                        </View>
                                                    </View>
                                                )}
                                                <View style={{ alignItems: 'center', paddingTop: 20 }}>
                                                    <Feather name="shopping-bag" size={48} color={colors.textSecondary} />
                                                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16, marginTop: 12 }}>Search for products</Text>
                                                    <Text style={{ color: colors.textSecondary, marginTop: 4, textAlign: 'center' }}>Find sneakers and clothing from StockX, GOAT & more</Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            )}

                            {/* Items / Canvas Tab Switcher - hidden on search mode */}
                            {(uploadMode === 'upload' || canvasItems.length > 0) && (
                                <View style={styles.tabSwitcher}>
                                    <Pressable
                                        style={[styles.tabButton, bottomTab === 'items' && styles.tabButtonActive]}
                                        onPress={() => setBottomTab('items')}
                                    >
                                        <Text style={[styles.tabText, bottomTab === 'items' && styles.tabTextActive]}>Items</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.tabButton, bottomTab === 'canvas' && styles.tabButtonActive]}
                                        onPress={() => setBottomTab('canvas')}
                                    >
                                        <Text style={[styles.tabText, bottomTab === 'canvas' && styles.tabTextActive]}>Canvas</Text>
                                    </Pressable>
                                </View>
                            )}

                            {/* Items Tab Content */}
                            {(uploadMode === 'upload' || canvasItems.length > 0) && bottomTab === 'items' && (
                                <View style={styles.wardrobeSection}>
                                    <Text style={[styles.sectionLabel, { color: colors.text }]}>Wardrobe</Text>
                                    <FolderCarousel />
                                    <AssetGrid onAssetSelect={handleAssetSelect} />
                                </View>
                            )}

                            {/* Canvas Tab Content (Backgrounds) */}
                            {(uploadMode === 'upload' || canvasItems.length > 0) && bottomTab === 'canvas' && (
                                <View style={styles.backgroundSection}>
                                    <View style={styles.backgroundGrid}>
                                        {BACKGROUND_OPTIONS.map((bg) => (
                                            <Pressable
                                                key={bg.id}
                                                style={[
                                                    styles.backgroundCard,
                                                    { backgroundColor: bg.color || '#f5f5f5' },
                                                    selectedBackground.id === bg.id && styles.backgroundCardSelected
                                                ]}
                                                onPress={() => setSelectedBackground(bg)}
                                            >
                                                {bg.type === 'image' && bg.imageSource && (
                                                    <Image source={bg.imageSource} style={styles.backgroundCardImage} contentFit="cover" />
                                                )}
                                                <Text style={[styles.backgroundCardLabel, { color: bg.color === '#000000' ? '#fff' : '#000' }]}>
                                                    {bg.name}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>

                                    {/* Generate Fit Button */}
                                    <Pressable
                                        style={[styles.generateButton, canvasItems.length === 0 && styles.generateButtonDisabled]}
                                        onPress={handleGenerateOutfit}
                                        disabled={canvasItems.length === 0}
                                    >
                                        <Text style={styles.generateButtonIcon}>✨</Text>
                                        <Text style={styles.generateButtonText}>Generate fit</Text>
                                    </Pressable>


                                </View>
                            )}
                        </ScrollView>
                    )}

                    {/* Loading State */}
                    {isGenerating && (
                        <View style={styles.loadingContainer}>
                            <View style={styles.loadingCard}>
                                <ActivityIndicator size="large" color="#9333EA" />
                                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Fitted is cooking...</Text>
                            </View>
                        </View>
                    )}

                    {/* STEP 2: Preview Post */}
                    {currentStep === 2 && !isGenerating && (
                        <ScrollView
                            style={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.scrollContentContainer}
                        >
                            {/* Preview Carousel */}
                            <View style={{ width: CANVAS_WIDTH, height: CANVAS_WIDTH }}>
                                <FlatList
                                    data={[
                                        { type: 'generated', image: generatedImageUri },
                                        { type: 'board' }
                                    ]}
                                    horizontal
                                    pagingEnabled
                                    snapToInterval={CANVAS_WIDTH}
                                    decelerationRate="fast"
                                    showsHorizontalScrollIndicator={false}
                                    bounces={false}
                                    overScrollMode="never"
                                    style={{ width: CANVAS_WIDTH, height: CANVAS_WIDTH }}
                                    contentContainerStyle={{ width: CANVAS_WIDTH * 2 }}
                                    onMomentumScrollEnd={(e) => {
                                        const newIndex = Math.round(e.nativeEvent.contentOffset.x / CANVAS_WIDTH);
                                        setPreviewSlide(newIndex);
                                    }}
                                    getItemLayout={(_, index) => ({
                                        length: CANVAS_WIDTH,
                                        offset: CANVAS_WIDTH * index,
                                        index,
                                    })}
                                    keyExtractor={(_, idx) => idx.toString()}
                                    renderItem={({ item }) => (
                                        <View style={{ width: CANVAS_WIDTH, height: CANVAS_WIDTH, overflow: 'hidden' }}>
                                            <View style={styles.canvasContainer}>
                                                <View style={[
                                                    styles.canvas,
                                                    selectedBackground.type === 'color' && { backgroundColor: selectedBackground.color }
                                                ]}>
                                                    {selectedBackground.type === 'image' && selectedBackground.imageSource && (
                                                        <Image
                                                            source={selectedBackground.imageSource}
                                                            style={styles.canvasBackgroundImage}
                                                            contentFit="cover"
                                                        />
                                                    )}
                                                    {item.type === 'generated' && item.image ? (
                                                        <Image
                                                            source={{ uri: item.image }}
                                                            style={{ width: '100%', height: '100%' }}
                                                            contentFit="cover"
                                                        />
                                                    ) : (
                                                        canvasItems.map((canvasItem) => (
                                                            <View key={canvasItem.id} style={[
                                                                styles.previewItemContainer,
                                                                {
                                                                    left: canvasItem.x,
                                                                    top: canvasItem.y,
                                                                    transform: [
                                                                        { scale: canvasItem.scale },
                                                                        { rotate: `${canvasItem.rotation}rad` }
                                                                    ]
                                                                }
                                                            ]}>
                                                                {keepFrames && canvasItem.usePolaroid ? (
                                                                    <View style={{ width: 180, height: 180 }}>
                                                                        {/* Image renders first (behind) */}
                                                                        <View style={{ position: 'absolute', top: 15, left: 15, right: 15, bottom: 35, overflow: 'hidden' }}>
                                                                            <Image
                                                                                source={{ uri: canvasItem.url }}
                                                                                style={{ width: '100%', height: '100%' }}
                                                                                contentFit="contain"
                                                                            />
                                                                        </View>
                                                                        {/* Frame renders second (on top) */}
                                                                        <Image
                                                                            source={POLAROID_FRAME}
                                                                            style={{ position: 'absolute', width: '100%', height: '100%' }}
                                                                            contentFit="contain"
                                                                        />
                                                                    </View>
                                                                ) : (
                                                                    <Image
                                                                        source={{ uri: canvasItem.url }}
                                                                        style={{ width: 150, height: 150 }}
                                                                        contentFit="contain"
                                                                    />
                                                                )}
                                                            </View>
                                                        ))
                                                    )}
                                                </View>
                                            </View>
                                        </View>
                                    )}
                                />
                            </View>

                            {/* Pagination Dots */}
                            <View style={styles.paginationContainer}>
                                <View style={[styles.paginationDot, previewSlide === 0 && styles.paginationDotActive]} />
                                <View style={[styles.paginationDot, previewSlide === 1 && styles.paginationDotActive]} />
                            </View>

                            {/* Keep Frames Toggle */}
                            <View style={styles.keepFramesRow}>
                                <Pressable style={styles.checkbox} onPress={() => setKeepFrames(!keepFrames)}>
                                    {keepFrames && <Feather name="check" size={14} color="#fff" />}
                                </Pressable>
                                <Text style={[styles.keepFramesText, { color: colors.text }]}>Keep frames?</Text>
                            </View>

                            {/* Caption */}
                            <View style={styles.captionSection}>
                                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CAPTION</Text>
                                <TextInput
                                    style={[styles.captionInput, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                                    placeholder="Write a caption..."
                                    placeholderTextColor={colors.placeholder}
                                    value={caption}
                                    onChangeText={setCaption}
                                    multiline
                                    maxLength={500}
                                />
                            </View>

                            {/* Add Music */}
                            <View style={styles.optionSection}>
                                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ADD MUSIC</Text>
                                <Pressable
                                    style={[styles.musicRow, { backgroundColor: colors.backgroundSecondary }]}
                                    onPress={() => setShowMusicModal(true)}
                                >
                                    <View style={styles.musicIcon}>
                                        <Feather name="music" size={18} color={musicTrack ? colors.primary : colors.textSecondary} />
                                    </View>
                                    <Text style={[styles.musicText, { color: musicTrack ? colors.text : colors.placeholder }]}>
                                        {musicTrack ? musicTrack : 'Pick a track...'}
                                    </Text>
                                    <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                                </Pressable>
                            </View>

                            {/* Link Items */}
                            <View style={styles.optionSection}>
                                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>LINK ITEMS ({canvasItems.length})</Text>
                                {canvasItems.map((item) => (
                                    <View key={item.id} style={[styles.linkItemCard, { backgroundColor: colors.backgroundSecondary }]}>
                                        <Image source={{ uri: item.url }} style={styles.linkItemImage} />
                                        <View style={styles.linkItemInputs}>
                                            <TextInput
                                                style={[styles.linkInput, { borderColor: colors.border, color: colors.text }]}
                                                placeholder="Brand (e.g. Rick Owens)"
                                                placeholderTextColor={colors.placeholder}
                                                value={itemLinks[item.id]?.brand || item.brand || ''}
                                                onChangeText={(v) => updateItemLink(item.id, 'brand', v)}
                                            />
                                            <TextInput
                                                style={[styles.linkInput, { borderColor: colors.border, color: colors.text }]}
                                                placeholder="Item Name (e.g. Hoodie)"
                                                placeholderTextColor={colors.placeholder}
                                                value={itemLinks[item.id]?.name || item.itemName || ''}
                                                onChangeText={(v) => updateItemLink(item.id, 'name', v)}
                                            />
                                            <View style={styles.linkInputRow}>
                                                <TextInput
                                                    style={[styles.linkInput, styles.linkInputSmall, { borderColor: colors.border, color: colors.text }]}
                                                    placeholder="$ 0.00"
                                                    placeholderTextColor={colors.placeholder}
                                                    value={itemLinks[item.id]?.price || ''}
                                                    onChangeText={(v) => updateItemLink(item.id, 'price', v)}
                                                    keyboardType="numeric"
                                                />
                                                <TextInput
                                                    style={[styles.linkInput, styles.linkInputUrl, { borderColor: colors.border, color: colors.text }]}
                                                    placeholder="🔗 Purchase URL..."
                                                    placeholderTextColor={colors.placeholder}
                                                    value={itemLinks[item.id]?.url || item.purchaseLink || ''}
                                                    onChangeText={(v) => updateItemLink(item.id, 'url', v)}
                                                />
                                                <Pressable style={styles.addUrlButton}>
                                                    <Feather name="plus" size={16} color="#fff" />
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            {/* Share To */}
                            <View style={styles.optionSection}>
                                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>SHARE TO</Text>
                                <View style={styles.shareRow}>
                                    <Pressable
                                        style={[styles.shareButton, shareToInstagram && styles.shareButtonActive]}
                                        onPress={() => setShareToInstagram(!shareToInstagram)}
                                    >
                                        <Feather name="instagram" size={24} color={shareToInstagram ? colors.primary : colors.text} />
                                    </Pressable>
                                    <Pressable
                                        style={[styles.shareButton, shareToTikTok && styles.shareButtonActive]}
                                        onPress={() => setShareToTikTok(!shareToTikTok)}
                                    >
                                        <Text style={{ fontSize: 20 }}>♪</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.shareButton, shareToTwitter && styles.shareButtonActive]}
                                        onPress={() => setShareToTwitter(!shareToTwitter)}
                                    >
                                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: shareToTwitter ? colors.primary : colors.text }}>𝕏</Text>
                                    </Pressable>
                                </View>
                            </View>

                            {/* Action Buttons */}
                            <View style={styles.actionButtons}>
                                <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={goToPrevStep}>
                                    <Text style={styles.actionButtonSecondaryText}>Back to Edit</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.actionButton, styles.actionButtonPrimary, uploading && styles.actionButtonDisabled]}
                                    onPress={handlePublish}
                                    disabled={uploading}
                                >
                                    {uploading ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.actionButtonPrimaryText}>Publish Post</Text>
                                    )}
                                </Pressable>
                            </View>
                        </ScrollView>
                    )}
                </View>
            </TouchableWithoutFeedback>

            {/* Crop Modal */}
            {cropItem && (
                <CropModal
                    visible={!!cropItem}
                    imageUri={cropItem.originalUrl}
                    onClose={() => setCropItem(null)}
                    onCropComplete={handleCropComplete}
                />
            )}

            {/* Product Search Modal */}
            <ProductSearchModal
                visible={showProductSearch}
                onClose={() => setShowProductSearch(false)}
                onSelectProduct={handleProductSelect}
            />

            {/* Music Selection Modal */}
            <Modal
                visible={showMusicModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowMusicModal(false)}
            >
                <Pressable style={styles.musicModalOverlay} onPress={() => setShowMusicModal(false)}>
                    <Pressable style={[styles.musicModalContent, { backgroundColor: colors.background }]} onPress={e => e.stopPropagation()}>
                        <View style={styles.musicModalHandle} />
                        <View style={styles.musicModalHeader}>
                            <Text style={[styles.musicModalTitle, { color: colors.text }]}>Select Music</Text>
                            <Pressable onPress={() => setShowMusicModal(false)}>
                                <Feather name="x" size={24} color={colors.text} />
                            </Pressable>
                        </View>

                        {/* Search Input for Music */}
                        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
                            <TextInput
                                style={[styles.sceneInput, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                                placeholder="Search tracks..."
                                placeholderTextColor={colors.placeholder}
                                value={musicSearchQuery}
                                onChangeText={setMusicSearchQuery}
                            />
                        </View>

                        <ScrollView>
                            {PLACEHOLDER_MUSIC_TRACKS.filter(track =>
                                track.name.toLowerCase().includes(musicSearchQuery.toLowerCase()) ||
                                track.artist.toLowerCase().includes(musicSearchQuery.toLowerCase())
                            ).map((track) => (
                                <Pressable
                                    key={track.id}
                                    style={[
                                        styles.musicTrackRow,
                                        musicTrack === track.name && { backgroundColor: colors.backgroundSecondary }
                                    ]}
                                    onPress={() => {
                                        setMusicTrack(track.id === '1' ? null : track.name);
                                        setShowMusicModal(false);
                                    }}
                                >
                                    <View style={[styles.musicTrackIcon, { backgroundColor: colors.backgroundSecondary }]}>
                                        <Feather name={track.id === '1' ? 'volume-x' : 'music'} size={20} color={colors.primary} />
                                    </View>
                                    <View style={styles.musicTrackInfo}>
                                        <Text style={[styles.musicTrackName, { color: colors.text }]}>{track.name}</Text>
                                        <Text style={[styles.musicTrackArtist, { color: colors.textSecondary }]}>{track.artist} • {track.duration}</Text>
                                    </View>
                                    {musicTrack === track.name && (
                                        <View style={[styles.musicSelectButton, { backgroundColor: colors.primary }]}>
                                            <Feather name="check" size={16} color="#fff" />
                                        </View>
                                    )}
                                </Pressable>
                            ))}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flex: 1,
    },
    scrollContentContainer: {
        paddingBottom: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
    },
    publishButton: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    publishButtonDisabled: {
        opacity: 0.5,
    },
    publishButtonText: {
        fontWeight: '600',
        fontSize: 14,
    },
    canvasContainer: {
        position: 'relative',
        // No padding - edge-to-edge canvas
        backgroundColor: 'transparent',
    },
    canvas: {
        width: CANVAS_WIDTH,
        height: CANVAS_WIDTH,
        backgroundColor: '#111',
        // No borderRadius - sharp square corners
        position: 'relative',
        overflow: 'hidden',
    },
    canvasItem: {
        position: 'absolute',
        width: 150,
        height: 150,
    },
    canvasItemImage: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#444',
    },
    removeItemButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#ff3b5c',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cropItemButton: {
        position: 'absolute',
        top: -8,
        left: -8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#4a9eff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyCanvas: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
        marginTop: 12,
    },
    emptySubtext: {
        color: '#555',
        fontSize: 14,
        marginTop: 4,
    },
    tools: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
        backgroundColor: 'transparent',
    },
    toolButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        gap: 8,
    },
    toolText: {
        fontSize: 14,
        fontWeight: '600',
    },
    captionSection: {
        padding: 16,
        paddingBottom: 16,
        backgroundColor: 'transparent',
    },
    captionInput: {
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    backgroundSection: {
        paddingTop: 20,
        paddingHorizontal: 16,
        paddingBottom: 8,
        backgroundColor: 'transparent',
    },
    wardrobeSection: {
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: 'transparent',
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    backgroundPicker: {
        flexDirection: 'row',
    },
    backgroundOption: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundOptionSelected: {
        borderWidth: 2,
        borderColor: '#fff',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    facePhotoSection: {
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
    },
    facePhoto: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    facePhotoPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    facePhotoText: {
        fontSize: 12,
        marginTop: 8,
        fontWeight: '500',
    },
    facePhotoSubtext: {
        fontSize: 10,
        marginTop: 2,
    },
    itemsCounter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
    },
    itemsCounterText: {
        fontSize: 14,
        fontWeight: '500',
    },
    previewItem: {
        position: 'absolute',
        width: 150,
        height: 150,
    },
    optionSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    optionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        gap: 12,
    },
    optionText: {
        flex: 1,
        fontSize: 16,
    },
    toggleRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 12,
        marginBottom: 8,
    },
    toggleLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    toggleSwitch: {
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#444',
        padding: 2,
        justifyContent: 'center',
        overflow: 'hidden',
    },
    toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
    },
    toggleKnobActive: {
        alignSelf: 'flex-end',
    },
    // Polaroid frame toggle button styles
    polaroidToggleButton: {
        position: 'absolute',
        bottom: -10,
        right: -10,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    polaroidToggleActive: {
        backgroundColor: '#4CAF50',
    },
    // Canvas background image (full-bleed inside canvas)
    canvasBackgroundImage: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        // No borderRadius - matches square canvas
    },
    // Preview carousel pagination
    paginationContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 8,
    },
    paginationDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#555',
    },
    // Preview item container for positioning
    previewItemContainer: {
        position: 'absolute',
    },
    stepItem: {
        alignItems: 'center',
        gap: 4,
    },
    dot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        fontSize: 12,
        fontWeight: '500',
    },
    // New styles for redesigned UI
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    resetText: {
        fontSize: 14,
        fontWeight: '500',
    },
    chipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 6,
    },
    chipImage: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    sceneInput: {
        flex: 1,
        height: 36,
        borderRadius: 8,
        paddingHorizontal: 12,
        fontSize: 13,
    },
    toggleContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginVertical: 8,
        backgroundColor: '#F1F1F1',
        borderRadius: 10,
        padding: 4,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    toggleButtonActive: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    toggleText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#888',
    },
    toggleTextActive: {
        color: '#000',
        fontWeight: '600',
    },
    canvasEmpty: {
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: '#444',
    },
    uploadCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: '#666',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    floatingActions: {
        position: 'absolute',
        bottom: 16,
        right: 16,
        flexDirection: 'row',
        gap: 8,
    },
    floatingButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    tabSwitcher: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5E5',
    },
    tabButton: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabButtonActive: {
        borderBottomColor: '#000',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#888',
    },
    tabTextActive: {
        color: '#000',
        fontWeight: '600',
    },
    backgroundGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 12,
        gap: 8,
    },
    backgroundCard: {
        width: (SCREEN_WIDTH - 48) / 3,
        aspectRatio: 1,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    backgroundCardSelected: {
        borderWidth: 3,
        borderColor: '#9333EA',
    },
    backgroundCardImage: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    backgroundCardLabel: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    generateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 16,
        marginVertical: 16,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#9333EA',
        gap: 8,
    },
    generateButtonDisabled: {
        opacity: 0.5,
    },
    generateButtonIcon: {
        fontSize: 18,
    },
    generateButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingCard: {
        padding: 40,
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        fontWeight: '500',
    },
    paginationDotActive: {
        backgroundColor: '#9333EA',
    },
    keepFramesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 10,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#000',
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    keepFramesText: {
        fontSize: 14,
        fontWeight: '500',
    },
    musicRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        gap: 12,
    },
    musicIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#F1F1F1',
        justifyContent: 'center',
        alignItems: 'center',
    },
    musicText: {
        flex: 1,
        fontSize: 14,
    },
    linkItemCard: {
        flexDirection: 'row',
        padding: 12,
        borderRadius: 12,
        marginBottom: 10,
        gap: 12,
    },
    linkItemImage: {
        width: 60,
        height: 60,
        borderRadius: 8,
    },
    linkItemInputs: {
        flex: 1,
        gap: 8,
    },
    linkInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 13,
    },
    linkInputRow: {
        flexDirection: 'row',
        gap: 8,
    },
    linkInputSmall: {
        width: 70,
    },
    linkInputUrl: {
        flex: 1,
    },
    addUrlButton: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    linkedItemInfo: {
        flex: 1,
        justifyContent: 'center',
        gap: 4,
    },
    linkedItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    linkedItemBrand: {
        fontSize: 15,
        fontWeight: '700',
    },
    linkedItemName: {
        fontSize: 13,
    },
    // Search results styles (matching modal exactly)
    searchResultsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
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
    },
    productName: {
        fontSize: 13,
        fontWeight: '500',
        marginTop: 2,
        lineHeight: 18,
    },
    productPrice: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 6,
    },
    productAddButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Face & Scene Row styles
    faceSceneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    faceChip: {
        width: 64,
        height: 64,
        borderRadius: 32,
        position: 'relative',
        overflow: 'hidden',
    },
    faceChipImage: {
        width: '100%',
        height: '100%',
    },
    faceChipRemove: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#9333EA',
        justifyContent: 'center',
        alignItems: 'center',
    },
    faceUploadButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    faceUploadText: {
        fontSize: 10,
        marginTop: 2,
        fontWeight: '500',
    },
    sceneInputFlex: {
        flex: 1,
        height: 64,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        textAlignVertical: 'top',
    },
    // Music button styles
    musicButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 12,
        gap: 12,
    },
    musicButtonText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
    },
    // Music modal styles
    musicModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    musicModalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 16,
        paddingBottom: 40,
        maxHeight: '70%',
    },
    musicModalHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#ccc',
        alignSelf: 'center',
        marginBottom: 16,
    },
    musicModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    musicModalTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    musicTrackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 12,
    },
    musicTrackIcon: {
        width: 48,
        height: 48,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    musicTrackInfo: {
        flex: 1,
    },
    musicTrackName: {
        fontSize: 15,
        fontWeight: '600',
    },
    musicTrackArtist: {
        fontSize: 13,
        marginTop: 2,
    },
    musicSelectButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
    },
    shareRow: {
        flexDirection: 'row',
        gap: 12,
    },
    shareButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E5E5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shareButtonActive: {
        borderColor: '#9333EA',
        backgroundColor: 'rgba(147, 51, 234, 0.05)',
    },
    actionButtons: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 20,
        gap: 12,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonSecondary: {
        backgroundColor: '#F1F1F1',
    },
    actionButtonSecondaryText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333',
    },
    actionButtonPrimary: {
        backgroundColor: '#000',
    },
    actionButtonPrimaryText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    actionButtonDisabled: {
        opacity: 0.5,
    },
});

const stepStyles = StyleSheet.create({
    container: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 10, paddingHorizontal: 40 },
    stepItem: { alignItems: 'center', gap: 4, flex: 1 },
    stepWrapper: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    stepNum: { fontSize: 12, fontWeight: '700' },
    label: { fontSize: 12, fontWeight: '600' },
    line: { width: 30, height: 2, marginRight: 12, borderRadius: 1 },
});
