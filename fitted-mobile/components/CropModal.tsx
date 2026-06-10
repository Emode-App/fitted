import React, { useState, useEffect } from 'react';
import { StyleSheet, Modal, Pressable, Dimensions, ActivityIndicator, Image as RNImage } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import { Text, View } from '@/components/Themed';

/**
 * Check if a URI is a remote URL that needs to be downloaded
 */
const isRemoteUri = (uri: string): boolean => {
    return uri.startsWith('http://') || uri.startsWith('https://');
};

/**
 * Download a remote image to local cache for processing
 */
const downloadToLocalCache = async (remoteUri: string): Promise<string> => {
    // Create a unique filename based on the URI
    const filename = `crop_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const localUri = `${FileSystem.cacheDirectory}${filename}`;

    const downloadResult = await FileSystem.downloadAsync(remoteUri, localUri);

    if (downloadResult.status !== 200) {
        throw new Error(`Failed to download image: ${downloadResult.status}`);
    }

    return downloadResult.uri;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Use most of the screen for the image
const CONTAINER_WIDTH = SCREEN_WIDTH - 32;
const CONTAINER_HEIGHT = SCREEN_HEIGHT - 250; // Leave room for header and controls
const MIN_SIZE = 80;

interface CropModalProps {
    visible: boolean;
    imageUri: string;
    onClose: () => void;
    onCropComplete: (croppedUri: string) => void;
}

export default function CropModal({ visible, imageUri, onClose, onCropComplete }: CropModalProps) {
    const [processing, setProcessing] = useState(false);
    const [imageInfo, setImageInfo] = useState({ width: 1000, height: 1000, displayWidth: CONTAINER_WIDTH, displayHeight: CONTAINER_WIDTH });

    // Load actual image dimensions
    useEffect(() => {
        if (imageUri) {
            RNImage.getSize(imageUri, (width, height) => {
                // Calculate how the image will be displayed (contain mode)
                const aspectRatio = width / height;
                let displayWidth, displayHeight;

                if (aspectRatio > CONTAINER_WIDTH / CONTAINER_HEIGHT) {
                    // Image is wider - constrain by width
                    displayWidth = CONTAINER_WIDTH;
                    displayHeight = CONTAINER_WIDTH / aspectRatio;
                } else {
                    // Image is taller - constrain by height
                    displayHeight = CONTAINER_HEIGHT;
                    displayWidth = CONTAINER_HEIGHT * aspectRatio;
                }

                setImageInfo({ width, height, displayWidth, displayHeight });
            }, (error) => {
                console.error('Failed to get image size:', error);
            });
        }
    }, [imageUri]);

    // Crop box position and size - start centered with margin
    const boxX = useSharedValue(20);
    const boxY = useSharedValue(20);
    const boxWidth = useSharedValue(imageInfo.displayWidth - 40);
    const boxHeight = useSharedValue(imageInfo.displayHeight - 40);

    // Reset crop box when image changes
    useEffect(() => {
        boxX.value = 20;
        boxY.value = 20;
        boxWidth.value = Math.max(MIN_SIZE, imageInfo.displayWidth - 40);
        boxHeight.value = Math.max(MIN_SIZE, imageInfo.displayHeight - 40);
    }, [imageInfo.displayWidth, imageInfo.displayHeight]);

    // For gesture tracking
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);
    const startWidth = useSharedValue(0);
    const startHeight = useSharedValue(0);

    // Move the whole box
    const boxPan = Gesture.Pan()
        .onStart(() => {
            startX.value = boxX.value;
            startY.value = boxY.value;
        })
        .onUpdate((e) => {
            let newX = startX.value + e.translationX;
            let newY = startY.value + e.translationY;
            // Keep in bounds of the DISPLAYED image
            newX = Math.max(0, Math.min(newX, imageInfo.displayWidth - boxWidth.value));
            newY = Math.max(0, Math.min(newY, imageInfo.displayHeight - boxHeight.value));
            boxX.value = newX;
            boxY.value = newY;
        });

    // Resize from bottom-right corner
    const brPan = Gesture.Pan()
        .onStart(() => {
            startWidth.value = boxWidth.value;
            startHeight.value = boxHeight.value;
        })
        .onUpdate((e) => {
            let newWidth = startWidth.value + e.translationX;
            let newHeight = startHeight.value + e.translationY;
            newWidth = Math.max(MIN_SIZE, Math.min(newWidth, imageInfo.displayWidth - boxX.value));
            newHeight = Math.max(MIN_SIZE, Math.min(newHeight, imageInfo.displayHeight - boxY.value));
            boxWidth.value = newWidth;
            boxHeight.value = newHeight;
        });

    // Resize from top-left corner
    const tlPan = Gesture.Pan()
        .onStart(() => {
            startX.value = boxX.value;
            startY.value = boxY.value;
            startWidth.value = boxWidth.value;
            startHeight.value = boxHeight.value;
        })
        .onUpdate((e) => {
            let newX = startX.value + e.translationX;
            let newY = startY.value + e.translationY;
            let newWidth = startWidth.value - e.translationX;
            let newHeight = startHeight.value - e.translationY;

            // Constrain
            newX = Math.max(0, newX);
            newY = Math.max(0, newY);
            newWidth = Math.max(MIN_SIZE, newWidth);
            newHeight = Math.max(MIN_SIZE, newHeight);

            boxX.value = newX;
            boxY.value = newY;
            boxWidth.value = newWidth;
            boxHeight.value = newHeight;
        });

    // Resize from top-right corner
    const trPan = Gesture.Pan()
        .onStart(() => {
            startY.value = boxY.value;
            startWidth.value = boxWidth.value;
            startHeight.value = boxHeight.value;
        })
        .onUpdate((e) => {
            let newY = startY.value + e.translationY;
            let newWidth = startWidth.value + e.translationX;
            let newHeight = startHeight.value - e.translationY;

            newY = Math.max(0, newY);
            newWidth = Math.max(MIN_SIZE, Math.min(newWidth, imageInfo.displayWidth - boxX.value));
            newHeight = Math.max(MIN_SIZE, newHeight);

            boxY.value = newY;
            boxWidth.value = newWidth;
            boxHeight.value = newHeight;
        });

    // Resize from bottom-left corner
    const blPan = Gesture.Pan()
        .onStart(() => {
            startX.value = boxX.value;
            startWidth.value = boxWidth.value;
            startHeight.value = boxHeight.value;
        })
        .onUpdate((e) => {
            let newX = startX.value + e.translationX;
            let newWidth = startWidth.value - e.translationX;
            let newHeight = startHeight.value + e.translationY;

            newX = Math.max(0, newX);
            newWidth = Math.max(MIN_SIZE, newWidth);
            newHeight = Math.max(MIN_SIZE, Math.min(newHeight, imageInfo.displayHeight - boxY.value));

            boxX.value = newX;
            boxWidth.value = newWidth;
            boxHeight.value = newHeight;
        });

    const boxStyle = useAnimatedStyle(() => ({
        left: boxX.value,
        top: boxY.value,
        width: boxWidth.value,
        height: boxHeight.value,
    }));

    // Dark overlays - relative to the displayed image size
    const topOverlay = useAnimatedStyle(() => ({
        top: 0,
        left: 0,
        width: imageInfo.displayWidth,
        height: boxY.value,
    }));

    const bottomOverlay = useAnimatedStyle(() => ({
        top: boxY.value + boxHeight.value,
        left: 0,
        width: imageInfo.displayWidth,
        height: imageInfo.displayHeight - boxY.value - boxHeight.value,
    }));

    const leftOverlay = useAnimatedStyle(() => ({
        top: boxY.value,
        left: 0,
        width: boxX.value,
        height: boxHeight.value,
    }));

    const rightOverlay = useAnimatedStyle(() => ({
        top: boxY.value,
        left: boxX.value + boxWidth.value,
        width: imageInfo.displayWidth - boxX.value - boxWidth.value,
        height: boxHeight.value,
    }));

    const handleCrop = async () => {
        setProcessing(true);
        try {
            // If image is remote, download it to local cache first
            // ImageManipulator cannot process remote URLs directly
            let localImageUri = imageUri;
            if (isRemoteUri(imageUri)) {
                console.log('Downloading remote image for cropping...');
                localImageUri = await downloadToLocalCache(imageUri);
            }

            // Convert screen coordinates to actual image coordinates
            const scaleX = imageInfo.width / imageInfo.displayWidth;
            const scaleY = imageInfo.height / imageInfo.displayHeight;

            // Calculate raw values
            let originX = Math.round(boxX.value * scaleX);
            let originY = Math.round(boxY.value * scaleY);
            let cropWidth = Math.round(boxWidth.value * scaleX);
            let cropHeight = Math.round(boxHeight.value * scaleY);

            // Clamp to image bounds to prevent "Invalid crop options" error
            originX = Math.max(0, Math.min(originX, imageInfo.width - 1));
            originY = Math.max(0, Math.min(originY, imageInfo.height - 1));
            cropWidth = Math.max(1, Math.min(cropWidth, imageInfo.width - originX));
            cropHeight = Math.max(1, Math.min(cropHeight, imageInfo.height - originY));

            console.log('Crop params:', { originX, originY, cropWidth, cropHeight, imgW: imageInfo.width, imgH: imageInfo.height });

            const result = await ImageManipulator.manipulateAsync(
                localImageUri,
                [
                    {
                        crop: {
                            originX,
                            originY,
                            width: cropWidth,
                            height: cropHeight,
                        },
                    },
                ],
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
            );
            onCropComplete(result.uri);
        } catch (error) {
            console.error('Crop error:', error);
            onCropComplete(imageUri);
        } finally {
            setProcessing(false);
        }
    };

    const resetCrop = () => {
        boxX.value = 20;
        boxY.value = 20;
        boxWidth.value = imageInfo.displayWidth - 40;
        boxHeight.value = imageInfo.displayHeight - 40;
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <GestureHandlerRootView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable style={styles.headerBtn} onPress={onClose}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                    <Text style={styles.title}>Crop</Text>
                    <Pressable style={[styles.headerBtn, styles.doneBtn]} onPress={handleCrop} disabled={processing}>
                        {processing ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.doneText}>Done</Text>}
                    </Pressable>
                </View>

                {/* Image + Crop Area */}
                <View style={styles.cropAreaContainer}>
                    <View style={[styles.cropArea, { width: imageInfo.displayWidth, height: imageInfo.displayHeight }]}>
                        {/* The image */}
                        <Image
                            source={{ uri: imageUri }}
                            style={{ width: imageInfo.displayWidth, height: imageInfo.displayHeight }}
                            contentFit="fill"
                        />

                        {/* Dark overlays */}
                        <Animated.View style={[styles.overlay, topOverlay]} pointerEvents="none" />
                        <Animated.View style={[styles.overlay, bottomOverlay]} pointerEvents="none" />
                        <Animated.View style={[styles.overlay, leftOverlay]} pointerEvents="none" />
                        <Animated.View style={[styles.overlay, rightOverlay]} pointerEvents="none" />

                        {/* Crop box */}
                        <GestureDetector gesture={boxPan}>
                            <Animated.View style={[styles.cropBox, boxStyle]}>
                                {/* Grid lines */}
                                <View style={[styles.gridV, { left: '33.3%' }]} />
                                <View style={[styles.gridV, { left: '66.6%' }]} />
                                <View style={[styles.gridH, { top: '33.3%' }]} />
                                <View style={[styles.gridH, { top: '66.6%' }]} />

                                {/* Top-left corner */}
                                <GestureDetector gesture={tlPan}>
                                    <Animated.View style={[styles.corner, styles.resizeHandle, { top: -2, left: -2 }]}>
                                        <View style={styles.cornerL} />
                                        <View style={styles.cornerT} />
                                    </Animated.View>
                                </GestureDetector>

                                {/* Top-right corner */}
                                <GestureDetector gesture={trPan}>
                                    <Animated.View style={[styles.corner, styles.resizeHandle, { top: -2, right: -2 }]}>
                                        <View style={[styles.cornerL, { right: 0, left: undefined }]} />
                                        <View style={styles.cornerT} />
                                    </Animated.View>
                                </GestureDetector>

                                {/* Bottom-left corner */}
                                <GestureDetector gesture={blPan}>
                                    <Animated.View style={[styles.corner, styles.resizeHandle, { bottom: -2, left: -2 }]}>
                                        <View style={styles.cornerL} />
                                        <View style={[styles.cornerT, { bottom: 0, top: undefined }]} />
                                    </Animated.View>
                                </GestureDetector>

                                {/* Bottom-right corner */}
                                <GestureDetector gesture={brPan}>
                                    <Animated.View style={[styles.corner, styles.resizeHandle, { bottom: -2, right: -2 }]}>
                                        <View style={[styles.cornerL, { right: 0, left: undefined }]} />
                                        <View style={[styles.cornerT, { bottom: 0, top: undefined }]} />
                                    </Animated.View>
                                </GestureDetector>
                            </Animated.View>
                        </GestureDetector>
                    </View>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                    <Pressable style={styles.resetBtn} onPress={resetCrop}>
                        <Feather name="refresh-cw" size={16} color="#fff" />
                        <Text style={styles.resetText}>Reset</Text>
                    </Pressable>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: '#000',
    },
    headerBtn: { paddingVertical: 8, paddingHorizontal: 12 },
    title: { fontSize: 18, fontWeight: '600', color: '#fff' },
    cancelText: { color: '#fff', fontSize: 16 },
    doneBtn: { backgroundColor: '#fff', borderRadius: 8 },
    doneText: { color: '#000', fontWeight: '600', fontSize: 14 },
    cropAreaContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cropArea: {
        position: 'relative',
    },
    overlay: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    cropBox: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#fff',
    },
    gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
    gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
    corner: { position: 'absolute', width: 24, height: 24 },
    resizeHandle: { width: 44, height: 44 },
    cornerL: { position: 'absolute', top: 0, left: 0, width: 20, height: 4, backgroundColor: '#fff' },
    cornerT: { position: 'absolute', top: 0, left: 0, width: 4, height: 20, backgroundColor: '#fff' },
    controls: { padding: 24, alignItems: 'center', backgroundColor: '#000' },
    resetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#222',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        gap: 8,
    },
    resetText: { color: '#fff', fontSize: 14 },
});
