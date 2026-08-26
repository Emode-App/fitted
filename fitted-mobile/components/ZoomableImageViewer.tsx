import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

interface ZoomableImageViewerProps {
    visible: boolean;
    uri: string | null;
    onClose: () => void;
}

/**
 * Full-screen image with pinch-to-zoom.
 *
 * Every place that showed a generated look opened it at exactly one size, so
 * the one thing somebody wants to do with a picture of themselves in a fit --
 * get closer and check the shoes -- was the one thing they could not do. This
 * lives in its own file because that complaint applies to the styling
 * delivery, the post preview and the timeline alike, and three copies of
 * gesture code would drift apart within a week.
 */
export default function ZoomableImageViewer({ visible, uri, onClose }: ZoomableImageViewerProps) {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    // Reopening on a different picture must not inherit the last one's zoom.
    useEffect(() => {
        if (!visible) return;
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
    }, [visible, uri]);

    const settle = () => {
        'worklet';
        // Below 1x the image has been pulled smaller than the screen, which
        // reads as broken rather than zoomed out. Spring it back and recentre.
        if (scale.value < 1) {
            scale.value = withTiming(1);
            savedScale.value = 1;
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        } else {
            savedScale.value = scale.value;
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        }
    };

    const pinch = Gesture.Pinch()
        .onUpdate((event) => {
            scale.value = Math.min(savedScale.value * event.scale, MAX_SCALE);
        })
        .onEnd(settle);

    // Panning only means something once there is more image than screen, so at
    // 1x the gesture is left alone and the tap-to-close still works.
    const pan = Gesture.Pan()
        .onUpdate((event) => {
            if (scale.value <= 1) return;
            translateX.value = savedTranslateX.value + event.translationX;
            translateY.value = savedTranslateY.value + event.translationY;
        })
        .onEnd(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        });

    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            const zoomedIn = scale.value > 1.05;
            scale.value = withTiming(zoomedIn ? 1 : DOUBLE_TAP_SCALE);
            savedScale.value = zoomedIn ? 1 : DOUBLE_TAP_SCALE;
            if (zoomedIn) {
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            }
        });

    const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

    const imageStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            {/* The root has one of these, but a Modal renders in its own tree
                and gestures inside it are ignored on Android without this. */}
            <GestureHandlerRootView style={styles.root}>
                <BlurView intensity={40} style={StyleSheet.absoluteFill} tint="dark" />

                <GestureDetector gesture={composed}>
                    <Animated.View style={styles.stage}>
                        {uri ? (
                            // Sized explicitly, not with flex.
                            //
                            // The stage centres its children, which makes a
                            // flex:1 child shrink to its content on the cross
                            // axis -- so the image inside asked for 100% of a
                            // width that was zero and drew nothing at all. The
                            // modal opened, the close button appeared, and the
                            // picture was simply not there.
                            <Animated.View style={[styles.imageWrap, imageStyle]}>
                                <Image source={{ uri }} style={styles.image} contentFit="contain" />
                            </Animated.View>
                        ) : null}
                    </Animated.View>
                </GestureDetector>

                <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
                    <Feather name="x" size={24} color="#fff" />
                </Pressable>

                <View pointerEvents="none" style={styles.hintWrap}>
                    <View style={styles.hint}>
                        <Feather name="maximize" size={12} color="rgba(255,255,255,0.85)" />
                    </View>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
    },
    stage: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageWrap: {
        width: '100%',
        height: '100%',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    close: {
        position: 'absolute',
        top: 56,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    hintWrap: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    hint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
});
