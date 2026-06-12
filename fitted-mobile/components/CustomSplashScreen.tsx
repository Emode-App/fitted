import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
    Easing,
} from 'react-native-reanimated';
import { useResolvedTheme } from '@/stores/themeStore';

interface SplashScreenProps {
    onAnimationFinish?: () => void;
}

// Per-appearance palette: white wordmark on the dark background, black on the lighter ones.
const PALETTES = {
    dark: { bg: '#000000', text: '#ffffff' },
    light: { bg: '#ffffff', text: '#000000' },
    emode: { bg: '#F5F2EC', text: '#000000' },
} as const;

export const CustomSplashScreen = ({ onAnimationFinish }: SplashScreenProps) => {
    const theme = useResolvedTheme();
    const palette = PALETTES[theme] ?? PALETTES.dark;

    // Shared values for animations
    const opacity = useSharedValue(1);
    const scale = useSharedValue(0.5);
    const textOpacity = useSharedValue(0);

    useEffect(() => {
        // Animate scale: zoom-in-50 duration-700
        scale.value = withTiming(1, {
            duration: 700,
            easing: Easing.out(Easing.quad),
        });

        // Animate text opacity: enter from 0 to 1
        textOpacity.value = withTiming(1, {
            duration: 700,
            easing: Easing.out(Easing.quad),
        });

        // Delay exit animation
        const timeout = setTimeout(() => {
            opacity.value = withTiming(
                0,
                { duration: 1000, easing: Easing.out(Easing.quad) },
                (finished) => {
                    if (finished && onAnimationFinish) {
                        runOnJS(onAnimationFinish)();
                    }
                },
            );
        }, 1500);

        return () => clearTimeout(timeout);
    }, []);

    const animatedContainerStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const animatedTextStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: textOpacity.value,
    }));

    return (
        <Animated.View
            style={[styles.container, { backgroundColor: palette.bg }, animatedContainerStyle]}
            pointerEvents="none"
        >
            <Animated.Text style={[styles.text, { color: palette.text }, animatedTextStyle]}>
                EMODE.
            </Animated.Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    text: {
        fontSize: 60,
        fontWeight: '900',
        letterSpacing: -2,
    },
});
