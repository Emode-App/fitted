import { StyleSheet, TextInput, Pressable, Alert, ActivityIndicator, Dimensions, Keyboard, TouchableWithoutFeedback, View as RNView, Modal } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView, FlatList, ScrollView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import LoadingSpinner from '@/components/LoadingSpinner';

import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import { BACKGROUND_OPTIONS, DEFAULT_BACKGROUND, BackgroundOption, POLAROID_FRAME } from '@/constants/backgrounds';
import CropModal from '@/components/CropModal';
import TutorialModal, { useFirstVisitTutorial, TutorialStep } from '@/components/TutorialModal';
import ProductSearchModal from '@/components/ProductSearchModal';
import FolderCarousel from '@/components/FolderCarousel';
import AssetGrid from '@/components/AssetGrid';
import { Product, generateOutfit, searchProducts } from '@/services/aiService';
import { Asset, useWardrobeStore } from '@/stores/wardrobeStore';
import { useTheme } from '@/hooks/useTheme';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import { useMessagesStore } from '@/stores/messagesStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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

const CANVAS_TUTORIAL_STEPS: TutorialStep[] = [
    {
        icon: 'search',
        title: 'Find Your Pieces',
        body: 'Search for any clothing item or upload photos from your camera roll to add to the canvas.',
    },
    {
        icon: 'move',
        title: 'Arrange Your Fit',
        body: 'Drag, pinch to resize, and rotate items to build your outfit exactly how you want it.',
    },
    {
        icon: 'zap',
        title: 'Generate & Post',
        body: 'Hit generate for an AI-rendered look, then share it to your feed or save it to your wardrobe.',
    },
];

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

// Preview item — always 180×180 so position never shifts when toggling frames.
// Plays a damped swing animation whenever the frame state changes.
function PreviewItem({ canvasItem, keepFrames }: { canvasItem: CanvasItem; keepFrames: boolean }) {
    const swing = useSharedValue(0);
    const mounted = useRef(false);

    useEffect(() => {
        if (!mounted.current) { mounted.current = true; return; }
        swing.value = withSequence(
            withTiming( 0.22, { duration: 70 }),
            withTiming(-0.15, { duration: 100 }),
            withTiming( 0.09, { duration: 90 }),
            withTiming(-0.04, { duration: 80 }),
            withTiming( 0,    { duration: 70 }),
        );
    }, [keepFrames]);

    const swingStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${swing.value}rad` }],
    }));

    return (
        <Animated.View style={[{ width: 180, height: 180 }, swingStyle]}>
            {keepFrames && canvasItem.usePolaroid ? (
                <View style={{ width: 180, height: 180 }}>
                    <View style={{ position: 'absolute', top: 25, left: 25, width: 130, height: 130, overflow: 'hidden' }}>
                        <Image source={{ uri: canvasItem.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    </View>
                    <Image source={POLAROID_FRAME} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="contain" />
                </View>
            ) : (
                <Image source={{ uri: canvasItem.url }} style={{ width: 180, height: 180 }} contentFit="cover" />
            )}
        </Animated.View>
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

    // First-time canvas tutorial
    const { visible: showCanvasTutorial, dismiss: dismissCanvasTutorial } = useFirstVisitTutorial('has_seen_canvas_tutorial');

    // Step state (1 = Build, 2 = Preview)
    const [currentStep, setCurrentStep] = useState(1);

    const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);
    const [selectedBackground, setSelectedBackground] = useState<BackgroundOption>(DEFAULT_BACKGROUND);
    const [cropItem, setCropItem] = useState<CanvasItem | null>(null);
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [facePhotoUri, setFacePhotoUri] = useState<string | null>(null);
    const params = useLocalSearchParams();
    const draftId = params.draftId as string;
    const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

    // Styling-for-client params (passed from Messages screen)
    const forConversation = params.forConversation as string;
    const forClientId = params.forClientId as string;
    const forClientName = params.forClientName as string;
    const forClientFaceUrl = params.forClientFaceUrl as string;
    const isStylingFor = !!forConversation && !!forClientId;
    const sendStylingDelivery = useMessagesStore((state) => state.sendStylingDelivery);

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

    // Save to device state
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showSearchComingSoon, setShowSearchComingSoon] = useState(false);
    const [musicSearchQuery, setMusicSearchQuery] = useState('');

    // Ref for capturing canvas as image
    const canvasRef = useRef<RNView>(null);
    const previewBoardRef = useRef<RNView>(null); // Ref for capturing the board in preview step (Step 2)

    // Wardrobe store action
    const addAssetToWardrobe = useWardrobeStore((state) => state.addAsset);
    const createPost = usePostsStore((state) => state.createPost);

    // Camera Permissions
    const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();

    const navigation = useNavigation();

    // Note: Tab navigation cannot be intercepted/prevented in React Navigation
    // The unsaved work prompt is shown when user explicitly taps "Reset" or "New Fit"

    // Auto-load face photo: client's face when styling for someone, otherwise user's own
    useEffect(() => {
        if (isStylingFor && forClientFaceUrl && !facePhotoUri) {
            setFacePhotoUri(forClientFaceUrl);
        } else if (user?.ai_face_url && !facePhotoUri && !draftId && !isStylingFor) {
            setFacePhotoUri(user.ai_face_url);
        }
    }, [user?.ai_face_url, draftId, isStylingFor, forClientFaceUrl]);

    // Handle product added from marketplace via URL params
    useEffect(() => {
        const addProductUrl = params.addProductUrl as string;
        const addProductName = params.addProductName as string;
        const addProductId = params.addProductId as string;

        if (addProductUrl && addProductId) {
            // Add the product to canvas
            const newItem: CanvasItem = {
                id: addProductId + '_' + Date.now().toString(),
                url: addProductUrl,
                originalUrl: addProductUrl,
                x: CANVAS_WIDTH / 2 - 75,
                y: 150,
                usePolaroid: true,
                scale: 1,
                rotation: 0,
                itemName: addProductName,
            };
            setCanvasItems(prev => [...prev, newItem]);

            // Clear the params to avoid re-adding on subsequent renders
            router.setParams({ addProductUrl: '', addProductName: '', addProductId: '' });
        }
    }, [params.addProductUrl, params.addProductId]);

    // Hydrate Draft Logic - runs when draftId param changes OR when it differs from currentDraftId
    useEffect(() => {
        // Skip if no draftId param or no user
        if (!draftId || !user) return;

        // Skip if we already have this draft loaded
        if (draftId === currentDraftId) return;

        const loadDraft = async () => {
            try {
                const { data, error } = await supabase
                    .from('drafts')
                    .select('*')
                    .eq('id', draftId)
                    .single();

                if (error) throw error;
                if (data && data.data) {
                    const d = data.data;
                    // Set the current draft ID for future saves
                    setCurrentDraftId(draftId);
                    // Hydrate state
                    if (d.currentStep) setCurrentStep(d.currentStep);
                    if (d.canvasItems) setCanvasItems(d.canvasItems);
                    if (d.caption) setCaption(d.caption);
                    if (d.facePhotoUri) setFacePhotoUri(d.facePhotoUri);
                    if (d.sceneDescription) setSceneDescription(d.sceneDescription);
                    if (d.uploadMode) setUploadMode(d.uploadMode);
                    if (d.bottomTab) setBottomTab(d.bottomTab);
                    if (d.keepFrames !== undefined) setKeepFrames(d.keepFrames);
                    if (d.musicTrack) setMusicTrack(d.musicTrack);
                    if (d.itemLinks) setItemLinks(d.itemLinks);
                    if (d.generatedImageUri) setGeneratedImageUri(d.generatedImageUri);
                    if (d.capturedBoardUri) setCapturedBoardUri(d.capturedBoardUri);
                    if (d.selectedBackground) setSelectedBackground(d.selectedBackground);

                    Alert.alert('Draft Loaded', 'Resumed from saved draft.');
                }
            } catch (error) {
                console.error('Error loading draft:', error);
                Alert.alert('Error', 'Could not load draft.');
            }
        };
        loadDraft();
    }, [draftId, user, currentDraftId]);

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
        // Preserve the stored face from profile, don't clear it
        if (user?.ai_face_url) {
            setFacePhotoUri(user.ai_face_url);
        } else {
            setFacePhotoUri(null);
        }
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
        setSelectedBackground(DEFAULT_BACKGROUND);
        setCurrentDraftId(null); // Clear draft ID when starting fresh
        // Clear the URL param so the draft doesn't re-load
        router.setParams({ draftId: undefined });
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
        // Debounce - prevent multiple overlapping generations
        if (isGenerating) {
            return;
        }

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

    const handleSaveDraft = async () => {
        if (!user) {
            Alert.alert('Sign In Needed', 'Please sign in to save drafts.');
            return;
        }

        try {
            const draftType = currentStep === 1 ? 'board' : 'post';

            // Capture thumbnail
            let thumbnailBase64 = null;
            if (draftType === 'board' && canvasRef.current && canvasItems.length > 0) {
                // Briefly hide controls for capture
                setIsCapturing(true);
                await new Promise(resolve => setTimeout(resolve, 100)); // Short delay for render
                try {
                    const uri = await captureRef(canvasRef, { format: 'jpg', quality: 0.5, result: 'tmpfile' });
                    thumbnailBase64 = await imageToBase64(uri);
                } catch (e) {
                    console.warn('Draft thumbnail capture failed', e);
                } finally {
                    setIsCapturing(false);
                }
            } else if (draftType === 'post' && generatedImageUri) {
                thumbnailBase64 = generatedImageUri; // Already a data URI or we can use it directly
            }

            const draftData = {
                currentStep,
                canvasItems,
                caption,
                facePhotoUri,
                sceneDescription,
                uploadMode,
                bottomTab,
                keepFrames,
                musicTrack,
                itemLinks,
                generatedImageUri,
                capturedBoardUri,
                selectedBackground,
            };

            const payload = {
                user_id: user.id,
                type: draftType,
                data: draftData,
                thumbnail_url: thumbnailBase64, // Storing base64 directly in simpler MVP, or upload to storage if too large. For drafts, base64 thumb is okay-ish but storage is better. Let's upload thumb if it's large.
                updated_at: new Date().toISOString(),
            };

            // For MVP, letting thumbnail be base64 if small enough, but better to upload.
            // Let's standardise: upload thumbnail to drafts bucket or just use what we have.
            // To save time/complexity, I'll store the text. If it's too big, Supabase might complain.
            // Actually, let's just upload the thumbnail to 'avatars' (or a new 'drafts' bucket) to be safe? 
            // Or just 'posts' bucket since it's temp? 'posts' is public.
            // Let's skip thumbnail upload complexity for this specific step and just store base64 in the text field if usage is low. 
            // Actually, `thumbnail_url` expects a URL. I should upload it.

            if (thumbnailBase64) {
                const filename = `drafts/${user.id}_${Date.now()}_thumb.jpg`;
                // Strip data URI prefix if present (uploadImage expects raw base64)
                let rawBase64 = thumbnailBase64;
                if (thumbnailBase64.includes(',')) {
                    rawBase64 = thumbnailBase64.split(',')[1];
                }
                const publicUrl = await uploadImage('posts', filename, rawBase64);
                if (publicUrl) payload.thumbnail_url = publicUrl;
            }

            // Use currentDraftId to decide insert vs update
            if (currentDraftId) {
                // Update existing draft
                const { error } = await supabase
                    .from('drafts')
                    .update(payload)
                    .eq('id', currentDraftId);

                if (error) throw error;
                Alert.alert('Draft Updated', 'Your draft has been updated.');
            } else {
                // Insert new draft
                const { data, error } = await supabase
                    .from('drafts')
                    .insert(payload)
                    .select('id')
                    .single();

                if (error) throw error;

                // Store the new draft ID for future saves
                if (data?.id) {
                    setCurrentDraftId(data.id);
                }
                Alert.alert('Draft Saved', 'Your progress has been saved.');
            }

        } catch (error) {
            console.error('Save draft error:', error);
            Alert.alert('Save Failed', 'Could not save draft.');
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
    const RECENT_SEARCHES_KEY = 'emode_recent_product_searches';
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

    const uploadImage = async (bucket: string, filename: string, base64Data: string): Promise<string | null> => {
        if (!base64Data) {
            console.warn('uploadImage called with empty base64Data');
            return null;
        }

        try {
            const arrayBuffer = decode(base64Data);

            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(filename, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });

            if (error) throw error;

            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filename);
            return urlData.publicUrl;
        } catch (error) {
            console.error('Upload error:', error);
            return null;
        }
    };

    // Send outfit to client via DM (styling delivery)
    const handleSendToClient = async () => {
        if (!user || !forConversation || !forClientId) {
            Alert.alert('Error', 'Missing client information');
            return;
        }
        if (uploading) return;
        if (!generatedImageUri && !capturedBoardUri) {
            Alert.alert('Error', 'No image to send');
            return;
        }

        setUploading(true);
        try {
            let publicGeneratedUrl: string | null = null;
            let publicBoardUrl: string | null = null;

            // Upload generated image
            if (generatedImageUri) {
                const filename = `delivery_gen_${Date.now()}.jpg`;
                let base64 = '';
                if (generatedImageUri.startsWith('data:')) {
                    base64 = generatedImageUri.split(',')[1];
                } else {
                    base64 = await FileSystem.readAsStringAsync(generatedImageUri, { encoding: FileSystem.EncodingType.Base64 });
                }
                publicGeneratedUrl = await uploadImage('posts', filename, base64);
            }

            // Upload board image
            if (capturedBoardUri) {
                const filename = `delivery_board_${Date.now()}.jpg`;
                const base64 = await FileSystem.readAsStringAsync(capturedBoardUri, { encoding: FileSystem.EncodingType.Base64 });
                publicBoardUrl = await uploadImage('posts', filename, base64);
            }

            if (!publicGeneratedUrl && !publicBoardUrl) {
                Alert.alert('Error', 'Failed to upload images');
                return;
            }

            // Build items array
            const deliveryItems = canvasItems.map((item) => ({
                id: item.id,
                brand: item.brand || itemLinks[item.id]?.brand || 'Unknown',
                name: item.itemName || itemLinks[item.id]?.name || 'Item',
                price: parseFloat(itemLinks[item.id]?.price || '0') || 0,
                image_url: item.url,
                purchase_link: item.purchaseLink || itemLinks[item.id]?.url || '',
            }));

            // Send delivery message
            await sendStylingDelivery(forConversation, user.id, {
                generated_image_url: publicGeneratedUrl || publicBoardUrl!,
                board_image_url: publicBoardUrl || undefined,
                items: deliveryItems,
                caption: caption.trim() || undefined,
            });

            // Success — reset and navigate back to messages
            resetWorkflow();
            router.setParams({ forConversation: '', forClientId: '', forClientName: '', forClientFaceUrl: '' });
            Alert.alert('Delivered! \u{1F389}', `Your styled outfit has been sent to ${forClientName}.`, [
                { text: 'View Chat', onPress: () => router.push('/(tabs)/messages') },
                { text: 'OK' },
            ]);
        } catch (error: any) {
            console.error('Send to client failed:', error);
            Alert.alert('Error', error.message || 'Failed to send outfit');
        } finally {
            setUploading(false);
        }
    };

    const handlePublish = async () => {
        if (!user) {
            Alert.alert('Error', 'Please sign in to post');
            return;
        }

        if (uploading) return;

        // If we are on Step 2 (Preview) and the user might have toggled "Keep Frames",
        // we should re-capture the board image from the preview view to ensure
        // the final post matches what they see (frames on/off).
        let finalBoardImageUri = capturedBoardUri;

        if (currentStep === 2 && previewBoardRef.current) {
            try {
                // We only need to re-capture if we're essentially looking at the board or if "Keep frames" matters.
                // Use a timeout to prevent infinite hanging if captureRef fails to resolve
                const capturePromise = captureRef(previewBoardRef, {
                    format: 'jpg',
                    quality: 0.9,
                    result: 'tmpfile',
                });

                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Capture timed out')), 2500)
                );

                const newBoardUri = await Promise.race([capturePromise, timeoutPromise]) as string;

                console.log('Recaptured board from preview:', newBoardUri);
                finalBoardImageUri = newBoardUri;
            } catch (err) {
                console.warn('Failed to recapture preview board (using original):', err);
                // Fallback to original capture if this fails
            }
        }

        if (!generatedImageUri && !finalBoardImageUri) {
            Alert.alert('Error', 'No image to publish');
            return;
        }

        setUploading(true);

        try {
            // Upload the selected image (generated or board)
            // If user is on slide 0 -> generated, slide 1 -> board
            // But we actually save BOTH usually? The post schema has `generated_image` and `board_image`.
            // We'll upload both if they exist.

            let publicGeneratedUrl: string | null = null;
            let publicBoardUrl: string | null = null;

            // 1. Upload Generated Image
            if (generatedImageUri && generatedImageUri.length > 0) {
                console.log('Processing generated image for upload...');
                const filename = `gen_${Date.now()}.jpg`;
                let base64 = '';

                // AI generation returns a Data URI (starts with "data:image..."),
                // while file system paths do not.
                if (generatedImageUri.startsWith('data:')) {
                    // Extract base64 part from Data URI
                    base64 = generatedImageUri.split(',')[1];
                } else {
                    // Read file from local path
                    console.log('Reading generated image file:', generatedImageUri);
                    base64 = await FileSystem.readAsStringAsync(generatedImageUri, { encoding: FileSystem.EncodingType.Base64 });
                }

                publicGeneratedUrl = await uploadImage('posts', filename, base64);
            }

            // 2. Upload Board Image (Collage)
            if (finalBoardImageUri && finalBoardImageUri.length > 0) {
                console.log('Reading board image file:', finalBoardImageUri);
                const filename = `board_${Date.now()}.jpg`;
                const base64 = await FileSystem.readAsStringAsync(finalBoardImageUri, { encoding: FileSystem.EncodingType.Base64 });
                publicBoardUrl = await uploadImage('posts', filename, base64);
            }

            // Build items array — itemLinks (entered in preview form) takes priority over
            // canvas item data so the user's manual edits always win.
            const itemsWithPositions = canvasItems.map((item) => ({
                id: item.id,
                brand: itemLinks[item.id]?.brand || item.brand || 'Unknown',
                name: itemLinks[item.id]?.name || item.itemName || 'Item',
                price: parseFloat(itemLinks[item.id]?.price || '0') || 0,
                image_url: item.url,
                purchase_link: itemLinks[item.id]?.url || item.purchaseLink || '',
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
                generated_image: publicGeneratedUrl || undefined,
                board_image: publicBoardUrl || undefined,
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
            console.error('Publishing failed:', error);
            const rawMessage = error.message || 'Failed to create post';
            // Truncate message if it's too long (avoids displaying base64 garble)
            const displayMessage = rawMessage.length > 200 ? rawMessage.substring(0, 200) + '...' : rawMessage;
            Alert.alert('Error', displayMessage);
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

    // Save generated image(s) to device camera roll
    const handleSaveToDevice = async (saveType: 'ai' | 'board' | 'both') => {
        setIsSaving(true);
        try {
            // Request permission
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Needed', 'Please allow access to save images to your device.');
                setIsSaving(false);
                return;
            }

            let savedCount = 0;

            // Helper: save a URI (data URI or file path) to camera roll
            const saveUri = async (uri: string, label: string) => {
                let fileUri = uri;

                // If it's a data URI, write to a temp file first
                if (uri.startsWith('data:')) {
                    const base64Data = uri.split(',')[1];
                    const tempPath = `${FileSystem.cacheDirectory}emode_save_${Date.now()}.jpg`;
                    await FileSystem.writeAsStringAsync(tempPath, base64Data, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    fileUri = tempPath;
                }

                const asset = await MediaLibrary.createAssetAsync(fileUri);
                if (asset) savedCount++;
            };

            // Save AI generated image
            if ((saveType === 'ai' || saveType === 'both') && generatedImageUri) {
                await saveUri(generatedImageUri, 'AI Outfit');
            }

            // Save board/collage image
            if ((saveType === 'board' || saveType === 'both') && capturedBoardUri) {
                await saveUri(capturedBoardUri, 'Mood Board');
            }

            // If board hasn't been captured yet but user wants it, capture now
            if ((saveType === 'board' || saveType === 'both') && !capturedBoardUri && previewBoardRef.current) {
                try {
                    const boardUri = await captureRef(previewBoardRef, {
                        format: 'jpg',
                        quality: 0.95,
                        result: 'tmpfile',
                    });
                    const asset = await MediaLibrary.createAssetAsync(boardUri);
                    if (asset) savedCount++;
                } catch (e) {
                    console.warn('Failed to capture board for save:', e);
                }
            }

            setShowSaveModal(false);

            if (savedCount > 0) {
                Alert.alert(
                    '✅ Saved!',
                    `${savedCount} image${savedCount > 1 ? 's' : ''} saved to your camera roll.`
                );
            } else {
                Alert.alert('Oops', 'No images were available to save.');
            }
        } catch (error: any) {
            console.error('Save to device error:', error);
            Alert.alert('Save Failed', error.message || 'Could not save image to device.');
        } finally {
            setIsSaving(false);
        }
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                            <Pressable onPress={handleSaveDraft}>
                                <Feather name="save" size={20} color={colors.textSecondary} />
                            </Pressable>
                            <Pressable onPress={resetWorkflow}>
                                <Text style={[styles.resetText, { color: colors.textSecondary }]}>Reset</Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* Styling-for-client banner */}
                    {isStylingFor && (
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            paddingVertical: 8, paddingHorizontal: 16, gap: 8,
                            backgroundColor: 'rgba(99, 102, 241, 0.08)',
                            borderBottomWidth: 1, borderBottomColor: 'rgba(99, 102, 241, 0.15)',
                        }}>
                            <MaterialCommunityIcons name="palette" size={16} color="#6366f1" />
                            <Text style={{ color: '#6366f1', fontSize: 13, fontWeight: '600', fontFamily: 'Inter_700Bold' }}>
                                Styling for {forClientName}
                            </Text>
                            <Pressable
                                onPress={() => {
                                    router.setParams({ forConversation: '', forClientId: '', forClientName: '', forClientFaceUrl: '' });
                                }}
                                style={{ marginLeft: 'auto' }}
                            >
                                <Feather name="x" size={16} color="#6366f1" />
                            </Pressable>
                        </View>
                    )}

                    {/* STEP 1: Build Fit */}
                    {currentStep === 1 && (
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
                                        <Pressable style={styles.faceChip} onPress={() => setFacePhotoUri(null)}>
                                            <Image source={{ uri: facePhotoUri }} style={styles.faceChipImage} />
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#9333ea' }}>Face Added</Text>
                                            <View style={styles.faceChipRemove}>
                                                <Feather name="x" size={12} color="#fff" />
                                            </View>
                                        </Pressable>
                                    ) : (
                                        <Pressable style={[styles.faceUploadButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={pickFacePhoto}>
                                            <Feather name="user" size={24} color={colors.textSecondary} />
                                            <Text style={[styles.faceUploadText, { color: colors.textSecondary }]}>Add Face</Text>
                                        </Pressable>
                                    )}

                                    {/* Scene Description Input */}
                                    <TextInput
                                        style={[styles.sceneInputFlex, { color: colors.text }]}
                                        placeholder="Describe scene (e.g. 'Standing in Tokyo')"
                                        placeholderTextColor={colors.placeholder}
                                        value={sceneDescription}
                                        onChangeText={setSceneDescription}
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

                                        {/* Canvas Items */}
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
                                                <Text style={styles.emptySubtextBold}>Start your fit check</Text>

                                                <View style={{ flexDirection: 'row', gap: 24, marginTop: 32 }}>
                                                    <Pressable style={{ alignItems: 'center' }} onPress={pickImage}>
                                                        <View style={styles.uploadCircle}>
                                                            <Feather name="image" size={32} color="#6b7280" />
                                                        </View>
                                                        <Text style={styles.emptyTextBold}>Upload</Text>
                                                    </Pressable>

                                                    <Pressable style={{ alignItems: 'center' }} onPress={handleTakePicture}>
                                                        <View style={styles.uploadCircle}>
                                                            <Feather name="camera" size={32} color="#6b7280" />
                                                        </View>
                                                        <Text style={styles.emptyTextBold}>Camera</Text>
                                                    </Pressable>
                                                </View>
                                            </View>
                                        )}


                                        {/* Loading Overlay - Outside capture ref but inside wrapper */}
                                        {isGenerating && (
                                            <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="light">
                                                <View style={styles.canvasLoadingOverlay}>
                                                    <LoadingSpinner size={48} />
                                                    <MaskedView
                                                        style={styles.gradientTextContainer}
                                                        maskElement={
                                                            <Text style={styles.loadingTextMask}>Emode is cooking...</Text>
                                                        }
                                                    >
                                                        <LinearGradient
                                                            colors={['#9333EA', '#EC4899', '#6366F1']}
                                                            start={{ x: 0, y: 0 }}
                                                            end={{ x: 1, y: 0 }}
                                                            style={styles.gradientTextFill}
                                                        />
                                                    </MaskedView>
                                                </View>
                                            </BlurView>
                                        )}
                                    </RNView>

                                    {/* Floating Action Buttons (when items exist) */}
                                    {canvasItems.length > 0 && (
                                        <View style={styles.floatingActions}>
                                            <Pressable style={[styles.floatingButton, { backgroundColor: '#fff' }]} onPress={() => setShowSearchComingSoon(true)}>
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

                            {/* Inline Search UI - Coming Soon */}
                            {uploadMode === 'search' && canvasItems.length === 0 && (
                                <View style={[styles.canvasContainer, { backgroundColor: colors.background }]}>
                                    <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 300 }}>
                                        <View style={[styles.comingSoonIconCircle, { backgroundColor: 'rgba(147, 51, 234, 0.08)' }]}>
                                            <Feather name="search" size={32} color="#9333EA" />
                                        </View>
                                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, marginTop: 16, letterSpacing: -0.3 }}>Product Search</Text>
                                        <View style={[styles.comingSoonBadge, { marginTop: 10 }]}>
                                            <Text style={styles.comingSoonText}>COMING SOON</Text>
                                        </View>
                                        <Text style={{ color: colors.textSecondary, marginTop: 12, textAlign: 'center', fontSize: 14, lineHeight: 20, paddingHorizontal: 20 }}>
                                            Search and add items from StockX, GOAT & more directly to your fit. For now, upload your own images!
                                        </Text>
                                        <Pressable
                                            style={{ marginTop: 20, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
                                            onPress={() => setUploadMode('upload')}
                                        >
                                            <Text style={{ color: colors.primaryForeground, fontWeight: '600', fontSize: 14 }}>Switch to Upload</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            )}

                            {/* Original Inline Search UI - hidden for MVP, enable when ready */}
                            {false && uploadMode === 'search' && canvasItems.length === 0 && (
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
                                            /* Search Results - 2 column grid */
                                            <View style={styles.searchResultsGrid}>
                                                {searchResults.map((item, index) => (
                                                    <Pressable
                                                        key={`${item.name}-${index}`}
                                                        style={styles.productCard}
                                                        onPress={() => handleProductSelect(item)}
                                                    >
                                                        <View style={[styles.productCardInner, { backgroundColor: colors.backgroundSecondary }]}>
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
                                    <FolderCarousel />
                                    <AssetGrid onAssetSelect={handleAssetSelect} />

                                    {/* Generate Fit Button - Items Tab */}
                                    <Pressable
                                        style={[(canvasItems.length === 0 || isGenerating) && styles.generateButtonDisabled]}
                                        onPress={handleGenerateOutfit}
                                        disabled={canvasItems.length === 0 || isGenerating}
                                    >
                                        <LinearGradient
                                            colors={['#9333EA', '#4F46E5']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.generateButton}
                                        >
                                            <Text style={styles.generateButtonIcon}>{isGenerating ? '⏳' : '✨'}</Text>
                                            <Text style={styles.generateButtonText}>{isGenerating ? 'Generating...' : 'Generate fit'}</Text>
                                        </LinearGradient>
                                    </Pressable>
                                </View>
                            )}

                            {/* Canvas Tab Content (Backgrounds) */}
                            {(uploadMode === 'upload' || canvasItems.length > 0) && bottomTab === 'canvas' && (
                                <View style={styles.backgroundSection}>
                                    <View style={styles.backgroundGrid}>
                                        {BACKGROUND_OPTIONS.map((bg) => (
                                            <Pressable
                                                key={bg.id}
                                                style={styles.backgroundCard}
                                                onPress={() => setSelectedBackground(bg)}
                                            >
                                                <View style={[
                                                    styles.backgroundCardInner,
                                                    { backgroundColor: bg.color || '#f5f5f5' },
                                                    selectedBackground.id === bg.id && styles.backgroundCardSelected
                                                ]}>
                                                    {bg.type === 'image' && bg.imageSource && (
                                                        <Image source={bg.imageSource} style={styles.backgroundCardImage} contentFit="cover" />
                                                    )}
                                                    <Text style={[styles.backgroundCardLabel, { color: bg.color === '#000000' ? '#fff' : '#000' }]}>
                                                        {bg.name}
                                                    </Text>
                                                </View>
                                            </Pressable>
                                        ))}
                                    </View>

                                    {/* Generate Fit Button - Canvas Tab */}
                                    <Pressable
                                        style={[(canvasItems.length === 0 || isGenerating) && styles.generateButtonDisabled]}
                                        onPress={handleGenerateOutfit}
                                        disabled={canvasItems.length === 0 || isGenerating}
                                    >
                                        <LinearGradient
                                            colors={['#9333EA', '#4F46E5']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.generateButton}
                                        >
                                            <Text style={styles.generateButtonIcon}>{isGenerating ? '⏳' : '✨'}</Text>
                                            <Text style={styles.generateButtonText}>{isGenerating ? 'Generating...' : 'Generate fit'}</Text>
                                        </LinearGradient>
                                    </Pressable>


                                </View>
                            )}
                        </ScrollView>
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
                                            <RNView
                                                ref={item.type === 'board' ? previewBoardRef : undefined}
                                                collapsable={false}
                                                style={[styles.previewCanvas,
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
                                                            <PreviewItem canvasItem={canvasItem} keepFrames={keepFrames} />
                                                        </View>
                                                    ))
                                                )}
                                            </RNView>
                                        </View>
                                    )}
                                />

                                {/* Pagination Dots - positioned on the preview image */}
                                <View style={styles.paginationOverlay}>
                                    <View style={[styles.paginationDotSmall, previewSlide === 0 && styles.paginationDotSmallActive]} />
                                    <View style={[styles.paginationDotSmall, previewSlide === 1 && styles.paginationDotSmallActive]} />
                                </View>
                            </View>

                            {/* Keep Frames Toggle - smaller with shadow */}
                            <Pressable style={styles.keepFramesPillSmall} onPress={() => setKeepFrames(!keepFrames)}>
                                <View style={[styles.checkboxGreenSmall, keepFrames && styles.checkboxGreenActive]}>
                                    {keepFrames && <Feather name="check" size={10} color="#fff" />}
                                </View>
                                <Text style={styles.keepFramesTextSmall}>Keep frames?</Text>
                            </Pressable>

                            {/* Save to Device */}
                            <Pressable
                                style={styles.saveToDeviceButton}
                                onPress={() => setShowSaveModal(true)}
                            >
                                <Feather name="download" size={18} color="#fff" />
                                <Text style={styles.saveToDeviceText}>Save to Device</Text>
                            </Pressable>

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

                            {/* Add Music — Coming Soon */}
                            <View style={styles.optionSection}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>ADD MUSIC</Text>
                                    <View style={styles.comingSoonBadge}>
                                        <Text style={styles.comingSoonText}>COMING SOON</Text>
                                    </View>
                                </View>
                                <View
                                    style={[styles.musicRow, { backgroundColor: colors.backgroundSecondary, opacity: 0.5 }]}
                                >
                                    <View style={styles.musicIcon}>
                                        <Feather name="music" size={18} color={colors.textSecondary} />
                                    </View>
                                    <Text style={[styles.musicText, { color: colors.placeholder }]}>
                                        Pick a track...
                                    </Text>
                                    <Feather name="lock" size={16} color={colors.textTertiary} />
                                </View>
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
                                        <Ionicons name="logo-instagram" size={24} color={shareToInstagram ? colors.primary : colors.text} />
                                    </Pressable>
                                    <Pressable
                                        style={[styles.shareButton, shareToTikTok && styles.shareButtonActive]}
                                        onPress={() => setShareToTikTok(!shareToTikTok)}
                                    >
                                        <Ionicons name="logo-tiktok" size={24} color={shareToTikTok ? colors.primary : colors.text} />
                                    </Pressable>
                                    <Pressable
                                        style={[styles.shareButton, shareToTwitter && styles.shareButtonActive]}
                                        onPress={() => setShareToTwitter(!shareToTwitter)}
                                    >
                                        <Ionicons name="logo-twitter" size={24} color={shareToTwitter ? colors.primary : colors.text} />
                                    </Pressable>
                                </View>
                            </View>

                            {/* Action Buttons */}
                            <View style={styles.actionButtons}>
                                <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={goToPrevStep}>
                                    <Text style={styles.actionButtonSecondaryText}>Back to Edit</Text>
                                </Pressable>

                                {isStylingFor ? (
                                    /* Send to Client button — when styling for someone */
                                    <Pressable
                                        style={[styles.actionButton, uploading && styles.actionButtonDisabled]}
                                        onPress={handleSendToClient}
                                        disabled={uploading}
                                    >
                                        <LinearGradient
                                            colors={['#6366f1', '#4f46e5']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, gap: 8 }}
                                        >
                                            {uploading ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <>
                                                    <MaterialCommunityIcons name="send" size={18} color="#fff" />
                                                    <Text style={styles.actionButtonPrimaryText}>Send to {forClientName}</Text>
                                                </>
                                            )}
                                        </LinearGradient>
                                    </Pressable>
                                ) : (
                                    /* Normal publish button */
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
                                )}
                            </View>
                        </ScrollView>
                    )}
                </View>
            </TouchableWithoutFeedback>

            {/* Crop Modal */}
            {
                cropItem && (
                    <CropModal
                        visible={!!cropItem}
                        imageUri={cropItem.originalUrl}
                        onClose={() => setCropItem(null)}
                        onCropComplete={handleCropComplete}
                    />
                )
            }

            {/* Product Search Modal */}
            <ProductSearchModal
                visible={showProductSearch}
                onClose={() => setShowProductSearch(false)}
                onSelectProduct={handleProductSelect}
            />

            {/* Search Coming Soon Modal */}
            <Modal
                visible={showSearchComingSoon}
                transparent
                animationType="fade"
                onRequestClose={() => setShowSearchComingSoon(false)}
            >
                <Pressable style={styles.saveModalOverlay} onPress={() => setShowSearchComingSoon(false)}>
                    <Pressable style={[styles.saveModalContent, { backgroundColor: colors.background }]} onPress={e => e.stopPropagation()}>
                        <View style={styles.saveModalHandle} />
                        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                            <View style={[styles.comingSoonIconCircle, { backgroundColor: 'rgba(147, 51, 234, 0.08)' }]}>
                                <Feather name="search" size={28} color="#9333EA" />
                            </View>
                            <Text style={[styles.saveModalTitle, { color: colors.text, marginTop: 16 }]}>Product Search</Text>
                            <View style={[styles.comingSoonBadge, { marginTop: 10 }]}>
                                <Text style={styles.comingSoonText}>COMING SOON</Text>
                            </View>
                            <Text style={{ color: colors.textSecondary, marginTop: 12, textAlign: 'center', fontSize: 14, lineHeight: 20, paddingHorizontal: 12 }}>
                                Soon you'll be able to search and add items from StockX, GOAT & more directly to your fit.
                            </Text>
                        </View>
                        <Pressable
                            style={{ alignItems: 'center', paddingVertical: 16, marginTop: 12 }}
                            onPress={() => setShowSearchComingSoon(false)}
                        >
                            <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 15 }}>Got it</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Save to Device Modal */}
            <Modal
                visible={showSaveModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowSaveModal(false)}
            >
                <Pressable style={styles.saveModalOverlay} onPress={() => !isSaving && setShowSaveModal(false)}>
                    <Pressable style={[styles.saveModalContent, { backgroundColor: colors.background }]} onPress={e => e.stopPropagation()}>
                        <View style={styles.saveModalHandle} />
                        <Text style={[styles.saveModalTitle, { color: colors.text }]}>Save to Device</Text>
                        <Text style={[styles.saveModalSubtitle, { color: colors.textSecondary }]}>
                            Choose which image to save to your camera roll
                        </Text>

                        <View style={styles.saveModalOptions}>
                            {/* AI Image Option */}
                            {generatedImageUri && (
                                <Pressable
                                    style={[styles.saveOptionCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                                    onPress={() => !isSaving && handleSaveToDevice('ai')}
                                    disabled={isSaving}
                                >
                                    <View style={[styles.saveOptionIcon, { backgroundColor: 'rgba(147, 51, 234, 0.1)' }]}>
                                        <Feather name="cpu" size={22} color="#9333EA" />
                                    </View>
                                    <View style={styles.saveOptionInfo}>
                                        <Text style={[styles.saveOptionTitle, { color: colors.text }]}>AI Outfit</Text>
                                        <Text style={[styles.saveOptionDesc, { color: colors.textSecondary }]}>The generated image</Text>
                                    </View>
                                    <Feather name="download" size={20} color={colors.textSecondary} />
                                </Pressable>
                            )}

                            {/* Board Option */}
                            {(capturedBoardUri || canvasItems.length > 0) && (
                                <Pressable
                                    style={[styles.saveOptionCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                                    onPress={() => !isSaving && handleSaveToDevice('board')}
                                    disabled={isSaving}
                                >
                                    <View style={[styles.saveOptionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                                        <Feather name="layout" size={22} color="#3b82f6" />
                                    </View>
                                    <View style={styles.saveOptionInfo}>
                                        <Text style={[styles.saveOptionTitle, { color: colors.text }]}>Mood Board</Text>
                                        <Text style={[styles.saveOptionDesc, { color: colors.textSecondary }]}>Your collage layout</Text>
                                    </View>
                                    <Feather name="download" size={20} color={colors.textSecondary} />
                                </Pressable>
                            )}

                            {/* Both Option */}
                            {generatedImageUri && (capturedBoardUri || canvasItems.length > 0) && (
                                <Pressable
                                    style={[styles.saveOptionCard, styles.saveOptionCardBoth, { borderColor: '#9333EA' }]}
                                    onPress={() => !isSaving && handleSaveToDevice('both')}
                                    disabled={isSaving}
                                >
                                    <LinearGradient
                                        colors={['rgba(147, 51, 234, 0.08)', 'rgba(59, 130, 246, 0.08)']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <View style={[styles.saveOptionIcon, { backgroundColor: 'rgba(147, 51, 234, 0.15)' }]}>
                                        <Feather name="download-cloud" size={22} color="#9333EA" />
                                    </View>
                                    <View style={styles.saveOptionInfo}>
                                        <Text style={[styles.saveOptionTitle, { color: colors.text }]}>Save Both</Text>
                                        <Text style={[styles.saveOptionDesc, { color: colors.textSecondary }]}>AI outfit + mood board</Text>
                                    </View>
                                    <Feather name="check-circle" size={20} color="#9333EA" />
                                </Pressable>
                            )}
                        </View>

                        {isSaving && (
                            <View style={styles.savingOverlay}>
                                <ActivityIndicator size="small" color="#9333EA" />
                                <Text style={{ color: colors.textSecondary, marginLeft: 8, fontSize: 14 }}>Saving...</Text>
                            </View>
                        )}

                        <Pressable
                            style={styles.saveModalCancel}
                            onPress={() => !isSaving && setShowSaveModal(false)}
                        >
                            <Text style={[styles.saveModalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>

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

            <TutorialModal
                visible={showCanvasTutorial && currentStep === 1}
                onDismiss={dismissCanvasTutorial}
                title="The Canvas"
                steps={CANVAS_TUTORIAL_STEPS}
            />
        </GestureHandlerRootView >
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
        backgroundColor: 'transparent',
    },
    canvas: {
        width: CANVAS_WIDTH,
        height: CANVAS_WIDTH,
        backgroundColor: '#fff',
        position: 'relative',
        overflow: 'hidden',
    },
    previewCanvas: {
        width: CANVAS_WIDTH,
        height: CANVAS_WIDTH,
        backgroundColor: '#fff',
        // No borderRadius for square preview
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
    emptyTextBold: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
        marginTop: 8,
    },
    emptySubtext: {
        color: '#555',
        fontSize: 14,
        marginTop: 4,
    },
    emptySubtextBold: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1F2937',
        marginTop: 16,
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
    wardrobeTitle: {
        fontSize: 20,
        fontWeight: '900',
        fontFamily: 'Inter_900Black',
        paddingHorizontal: 16,
        marginBottom: 4,
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
    paginationPill: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 6,
        marginTop: 8,
        alignSelf: 'center',
    },
    paginationDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#555',
    },
    paginationOverlay: {
        position: 'absolute',
        bottom: 16,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    paginationDotSmall: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.5)',
    },
    paginationDotSmallActive: {
        backgroundColor: '#fff',
    },
    keepFramesPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        gap: 8,
        marginTop: 16,
    },
    keepFramesPillSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
        marginTop: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    checkboxGreen: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#22c55e',
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxGreenSmall: {
        width: 16,
        height: 16,
        borderRadius: 3,
        borderWidth: 2,
        borderColor: '#22c55e',
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxGreenActive: {
        backgroundColor: '#22c55e',
        borderColor: '#22c55e',
    },
    keepFramesTextSmall: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6b7280',
        fontFamily: 'Inter_700Bold',
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
        color: '#6b7280',
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
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
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
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 2,
    },
    toggleText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    toggleTextActive: {
        color: '#000',
        fontWeight: '700',
    },
    canvasEmpty: {
        backgroundColor: '#f3f4f6',
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: '#d1d5db',
    },
    uploadCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#e5e7eb',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    floatingActions: {
        position: 'absolute',
        bottom: 16,
        right: 24,
        flexDirection: 'column',
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
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 5,
        borderWidth: 1,
        borderColor: '#f3f4f6',
    },
    tabSwitcher: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
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
        fontWeight: '600',
        color: '#9ca3af',
    },
    tabTextActive: {
        color: '#000',
        fontWeight: '700',
    },
    backgroundGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 16,
    },
    backgroundCard: {
        flexBasis: '25%', // 4 columns like grid-cols-4
        padding: 4, // gap between items
        aspectRatio: 1,
    },
    backgroundCardInner: {
        flex: 1,
        borderRadius: 12,
        justifyContent: 'flex-end',
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#e5e7eb',
    },
    backgroundCardSelected: {
        borderColor: '#000',
        transform: [{ scale: 0.95 }],
    },
    backgroundCardImage: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    backgroundCardLabel: {
        fontSize: 9,
        fontWeight: '700',
        textAlign: 'center',
        backgroundColor: 'rgba(255,255,255,0.8)',
        paddingHorizontal: 4,
        paddingVertical: 2,
        marginBottom: 4,
        borderRadius: 4,
    },
    generateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 16,
        marginVertical: 16,
        height: 56,
        borderRadius: 16,
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
    canvasLoadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        //borderRadius: 16,
    },
    loadingCard: {
        padding: 40,
        alignItems: 'center',
        gap: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 16,
    },
    loadingText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#6b7280',
    },
    gradientTextContainer: {
        marginTop: 16,
        width: 200,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingTextMask: {
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
    },
    gradientTextFill: {
        width: 200,
        height: 28,
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
    comingSoonBadge: {
        backgroundColor: 'rgba(147, 51, 234, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(147, 51, 234, 0.2)',
    },
    comingSoonIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    comingSoonText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#9333EA',
        letterSpacing: 0.5,
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
    // Search results styles - simple 2 column grid
    searchResultsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    productCard: {
        flexBasis: '50%', // 2 columns like grid-cols-2
        padding: 6, // gap between items
    },
    productCardInner: {
        flex: 1,
        borderRadius: 12,
        overflow: 'hidden',
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 1.25, // 5:4 ratio (replaces ITEM_WIDTH * 0.8)
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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 24,
        backgroundColor: '#faf5ff',
        borderWidth: 1,
        borderColor: '#d8b4fe',
        gap: 8,
    },
    faceChipImage: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    faceChipRemove: {
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
        height: 40,
        borderRadius: 20,
        paddingHorizontal: 16,
        fontSize: 12,
        backgroundColor: '#f9fafb',
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
    // Save to Device button
    saveToDeviceButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 12,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#18181b',
    },
    saveToDeviceText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    // Save Modal styles
    saveModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    saveModalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 36,
    },
    saveModalHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        alignSelf: 'center',
        marginBottom: 20,
    },
    saveModalTitle: {
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    saveModalSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 24,
    },
    saveModalOptions: {
        gap: 10,
    },
    saveOptionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        gap: 14,
        overflow: 'hidden',
    },
    saveOptionCardBoth: {
        borderWidth: 1.5,
        borderStyle: 'dashed',
    },
    saveOptionIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveOptionInfo: {
        flex: 1,
    },
    saveOptionTitle: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    saveOptionDesc: {
        fontSize: 13,
        marginTop: 2,
    },
    savingOverlay: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
    },
    saveModalCancel: {
        alignItems: 'center',
        paddingVertical: 16,
        marginTop: 8,
    },
    saveModalCancelText: {
        fontSize: 15,
        fontWeight: '600',
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
