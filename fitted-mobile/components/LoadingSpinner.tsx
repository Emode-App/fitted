import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
    useSharedValue,
    withRepeat,
    withTiming,
    Easing,
    cancelAnimation,
    useAnimatedStyle
} from 'react-native-reanimated';

interface LoadingSpinnerProps {
    size?: number;
    strokeWidth?: number;
}

export default function LoadingSpinner({
    size = 48,
    strokeWidth = 4
}: LoadingSpinnerProps) {
    const rotation = useSharedValue(0);

    useEffect(() => {
        // Rotate the spinner
        rotation.value = withRepeat(
            withTiming(360, {
                duration: 1000,
                easing: Easing.linear,
            }),
            -1
        );

        return () => {
            cancelAnimation(rotation);
        };
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ rotate: `${rotation.value}deg` }],
        };
    });

    // Calculate circle properties
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDasharray = `${circumference} ${circumference}`;
    const strokeDashoffset = circumference * 0.25; // Shows 75% of the circle

    return (
        <Animated.View style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, animatedStyle]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <LinearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#9333EA" />
                        <Stop offset="50%" stopColor="#EC4899" />
                        <Stop offset="100%" stopColor="#6366F1" />
                    </LinearGradient>
                </Defs>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="url(#spinnerGradient)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </Svg>
        </Animated.View>
    );
}
