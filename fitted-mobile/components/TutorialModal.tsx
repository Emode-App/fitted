import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import { accountKey } from '@/services/localUserData';

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
    const userId = useAuthStore((state) => state.user?.id);

    // The answer lives on the account, not the device.
    //
    // Two previous attempts kept it in AsyncStorage -- first a bare key that
    // sign-out wiped, then one slotted per account -- and people still reported
    // the tour on every sign-in. Device storage is the wrong home for a fact
    // about an account: it cannot be inspected from the server, so "it works
    // now" is unverifiable, and it dies on reinstall or a second phone anyway.
    // user_settings.seen_tutorials is checkable and permanent. The local copy
    // stays as a cache so the modal does not flash before the row loads.
    const cacheKey = accountKey(storageKey, userId);

    useEffect(() => {
        if (!enabled || !userId) return;
        let cancelled = false;

        (async () => {
            if (await AsyncStorage.getItem(cacheKey) === 'true') return;

            const { data } = await supabase
                .from('user_settings')
                .select('seen_tutorials')
                .eq('user_id', userId)
                .maybeSingle();

            const seen: string[] = data?.seen_tutorials ?? [];
            if (seen.includes(storageKey)) {
                await AsyncStorage.setItem(cacheKey, 'true');
                return;
            }

            if (!cancelled) setVisible(true);
        })();

        return () => { cancelled = true; };
    }, [enabled, userId, cacheKey, storageKey]);

    const dismiss = async () => {
        setVisible(false);
        // Cache first so it cannot come back on this device even if the write
        // fails; the server call is what makes it stick everywhere else.
        await AsyncStorage.setItem(cacheKey, 'true').catch(() => {});
        const { error } = await supabase.rpc('mark_tutorial_seen', { tutorial_key: storageKey });
        if (error) console.warn('[tutorial] could not record dismissal:', error.message);
    };

    return { visible, dismiss };
}

export default function TutorialModal({ visible, onDismiss, title, steps }: TutorialModalProps) {
    const [stepIndex, setStepIndex] = useState(0);
    // The card used to bake in a dark palette, so it stayed black on the light
    // and cream themes while everything behind it was pale.
    const { colors, isDark } = useTheme();

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
            <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Pressable style={styles.skipBtn} onPress={() => { setStepIndex(0); onDismiss(); }} hitSlop={12}>
                    <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
                </Pressable>

                <View style={[styles.iconCircle, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                    <Feather name={step.icon} size={28} color={colors.text} />
                </View>

                <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
                <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>{step.body}</Text>

                <View style={styles.dots}>
                    {steps.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                { backgroundColor: colors.border },
                                i === stepIndex && { backgroundColor: colors.primary },
                            ]}
                        />
                    ))}
                </View>

                <Pressable style={[styles.nextBtn, { backgroundColor: colors.primary }]} onPress={handleNext}>
                    <Text style={[styles.nextBtnText, { color: colors.primaryForeground }]}>{isLast ? 'Got it' : 'Next'}</Text>
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
        borderRadius: 24,
        borderWidth: 1,
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
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        marginTop: 8,
    },
    title: {
        fontFamily: 'Inter_900Black',
        fontSize: 13,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    stepTitle: {
        fontFamily: 'Inter_700Bold',
        fontSize: 22,
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 10,
    },
    body: {
        fontSize: 15,
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
    },
    dotActive: {
        width: 20,
    },
    nextBtn: {
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 40,
        alignItems: 'center',
    },
    nextBtnText: {
        fontFamily: 'Inter_700Bold',
        fontSize: 15,
    },
});
