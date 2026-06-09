import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    runOnJS,
    Easing
} from 'react-native-reanimated';

interface SplashScreenProps {
    onAnimationFinish?: () => void;
}

export const CustomSplashScreen = ({ onAnimationFinish }: SplashScreenProps) => {
    // Shared values for animations
    const opacity = useSharedValue(1);
    const scale = useSharedValue(0.5);
    const textOpacity = useSharedValue(0);

    useEffect(() => {
        // Animate scale: zoom-in-50 duration-700
        scale.value = withTiming(1, {
            duration: 700,
            easing: Easing.out(Easing.quad)
        });

        // Animate text opacity: enter from 0 to 1
        textOpacity.value = withTiming(1, {
            duration: 700,
            easing: Easing.out(Easing.quad)
        });

        // Delay exit animation
        const timeout = setTimeout(() => {
            // Animate opacity: duration-1000 ease-out
            opacity.value = withTiming(0, {
                duration: 1000,
                easing: Easing.out(Easing.quad)
            }, (finished) => {
                if (finished && onAnimationFinish) {
                    runOnJS(onAnimationFinish)();
                }
            });
        }, 1500); // Allow some time for the logo to interact/be seen before fading (adjust as needed)

        return () => clearTimeout(timeout);
    }, []);

    const animatedContainerStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
        };
    });

    const animatedTextStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: textOpacity.value,
        };
    });

    return (
        <Animated.View style={[styles.container, animatedContainerStyle]} pointerEvents="none">
            <Animated.Text style={[styles.text, animatedTextStyle]}>
                EMODE.
            </Animated.Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000', // bg-black
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100, // z-[100]
    },
    text: {
        color: '#ffffff', // text-white
        fontSize: 60, // approx text-6xl
        fontWeight: '900', // font-black
        letterSpacing: -2, // tracking-tighter
    },
});
