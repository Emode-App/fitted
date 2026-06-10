import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TutorialStep {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    body: string;
}

interface TutorialModalProps {
    visible: boolean;
    onDismiss: () => void;
    title: string;
    steps: TutorialStep[];
}

// Hook that checks AsyncStorage for a "seen" flag and exposes a dismiss
// handler that persists it. Mount this in any screen/modal that should
// show a one-time, skippable tutorial.
export function useFirstVisitTutorial(storageKey: string, enabled: boolean = true) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        (async () => {
            const seen = await AsyncStorage.getItem(storageKey);
            if (!cancelled && seen !== 'true') {
                setVisible(true);
            }
        })();
        return () => { cancelled = true; };
    }, [enabled]);

    const dismiss = async () => {
        setVisible(false);
        await AsyncStorage.setItem(storageKey, 'true');
    };

    return { visible, dismiss };
}

export default function TutorialModal({ visible, onDismiss, title, steps }: TutorialModalProps) {
    const [stepIndex, setStepIndex] = useState(0);

    if (!visible) return null;

    const step = steps[stepIndex];
    const isLast = stepIndex === steps.length - 1;

    const handleNext = () => {
        if (isLast) {
            setStepIndex(0);
            onDismiss();
        } else {
            setStepIndex((i) => i + 1);
        }
    };

    return (
        <View style={styles.overlay} pointerEvents="box-none">
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.card}>
                <Pressable style={styles.skipBtn} onPress={() => { setStepIndex(0); onDismiss(); }} hitSlop={12}>
                    <Text style={styles.skipText}>Skip</Text>
                </Pressable>

                <View style={styles.iconCircle}>
                    <Feather name={step.icon} size={28} color="#fff" />
                </View>

                <Text style={styles.title}>{title}</Text>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.body}>{step.body}</Text>

                <View style={styles.dots}>
                    {steps.map((_, i) => (
                        <View key={i} style={[styles.dot, i === stepIndex && styles.dotActive]} />
                    ))}
                </View>

                <Pressable style={styles.nextBtn} onPress={handleNext}>
                    <Text style={styles.nextBtnText}>{isLast ? 'Got it' : 'Next'}</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1000,
        elevation: 1000,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#111',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#27272a',
        padding: 24,
        alignItems: 'center',
    },
    skipBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        padding: 4,
    },
    skipText: {
        fontSize: 13,
        color: '#71717a',
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#1f1f1f',
        borderWidth: 1,
        borderColor: '#3f3f46',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        marginTop: 8,
    },
    title: {
        fontFamily: 'Inter_900Black',
        fontSize: 13,
        color: '#71717a',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    stepTitle: {
        fontFamily: 'Inter_700Bold',
        fontSize: 22,
        color: '#fff',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 10,
    },
    body: {
        fontSize: 15,
        color: '#a1a1aa',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    dots: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 20,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#27272a',
    },
    dotActive: {
        backgroundColor: '#fff',
        width: 20,
    },
    nextBtn: {
        backgroundColor: '#fff',
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 40,
        alignItems: 'center',
    },
    nextBtnText: {
        fontFamily: 'Inter_700Bold',
        fontSize: 15,
        color: '#000',
    },
});
