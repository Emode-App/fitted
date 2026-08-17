import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    ActivityIndicator,
    Linking,
    Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { createConnectAccount, getConnectOnboardingUrl } from '@/services/stripeService';

interface StripeConnectOnboardingProps {
    visible: boolean;
    onClose: () => void;
    onComplete: () => void;
}

export default function StripeConnectOnboarding({ visible, onClose, onComplete }: StripeConnectOnboardingProps) {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<'info' | 'connecting'>('info');

    const handleConnect = async () => {
        if (!user) return;
        setLoading(true);
        setStep('connecting');

        try {
            // Step 1: Create Connect account (or get existing). Identity is
            // derived from the JWT server-side; no ids are sent from the client.
            await createConnectAccount();

            // Step 2: Get onboarding URL for the caller's own account.
            const { url } = await getConnectOnboardingUrl();

            // Step 3: Open Stripe's hosted onboarding in the browser
            await Linking.openURL(url);

            // Completion is checked against Stripe on the stripe-return route.
            onClose();
        } catch (error: any) {
            console.error('Connect onboarding error:', error);
            Alert.alert('Could Not Start Onboarding', error.message || 'Please try again.');
            setStep('info');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />

                <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                    {/* Close button */}
                    <Pressable style={styles.closeButton} onPress={onClose}>
                        <Feather name="x" size={24} color={colors.textSecondary} />
                    </Pressable>

                    {step === 'connecting' ? (
                        /* Connecting state */
                        <View style={styles.connectingView}>
                            <ActivityIndicator size="large" color="#6366f1" />
                            <Text style={[styles.connectingText, { color: colors.text }]}>
                                Setting up your account...
                            </Text>
                            <Text style={[styles.connectingSub, { color: colors.textSecondary }]}>
                                You'll be redirected to Stripe to complete verification
                            </Text>
                        </View>
                    ) : (
                        /* Info state */
                        <>
                            {/* Icon */}
                            <View style={styles.iconWrapper}>
                                <LinearGradient
                                    colors={['#6366f1', '#4f46e5']}
                                    style={styles.iconCircle}
                                >
                                    <MaterialCommunityIcons name="bank-transfer" size={36} color="#fff" />
                                </LinearGradient>
                            </View>

                            {/* Title */}
                            <Text style={[styles.title, { color: colors.text }]}>
                                Set Up Seller{'\n'}Payouts
                            </Text>

                            {/* Subtitle */}
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                Stripe verifies sellers and sends payouts for eligible physical-goods orders.
                            </Text>

                            {/* Benefits */}
                            <View style={[styles.benefitsCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                                {[
                                    { icon: 'shield' as const, text: 'Stripe-hosted identity and payout setup' },
                                    { icon: 'zap' as const, text: 'Payout timing and availability are shown by Stripe' },
                                    { icon: 'percent' as const, text: 'The platform fee is deducted from eligible sales' },
                                ].map((item, i) => (
                                    <View key={i} style={styles.benefitItem}>
                                        <View style={[styles.checkCircle, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                                            <Feather name={item.icon} size={14} color="#6366f1" />
                                        </View>
                                        <Text style={[styles.benefitText, { color: colors.text }]}>{item.text}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Powered by Stripe */}
                            <View style={styles.poweredBy}>
                                <Text style={[styles.poweredByText, { color: colors.textTertiary }]}>
                                    Powered by
                                </Text>
                                <Text style={[styles.stripeLogo, { color: '#6366f1' }]}>stripe</Text>
                            </View>

                            {/* Connect button */}
                            <Pressable onPress={handleConnect} disabled={loading} style={styles.connectButtonWrapper}>
                                <LinearGradient
                                    colors={['#6366f1', '#4f46e5']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={[styles.connectButton, loading && styles.buttonDisabled]}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <MaterialCommunityIcons name="bank-plus" size={20} color="#fff" />
                                            <Text style={styles.connectButtonText}>Connect Bank Account</Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </Pressable>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        width: '88%',
        maxWidth: 380,
        borderRadius: 24,
        padding: 24,
        paddingTop: 32,
        alignItems: 'center',
        boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.25)',
        elevation: 10,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Icon
    iconWrapper: {
        marginBottom: 20,
    },
    iconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Title
    title: {
        fontSize: 22,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    },
    // Benefits
    benefitsCard: {
        width: '100%',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        gap: 14,
        marginBottom: 16,
    },
    benefitItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    checkCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    benefitText: {
        fontSize: 13,
        flex: 1,
        fontFamily: 'Inter_500Medium',
    },
    // Powered by
    poweredBy: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 16,
    },
    poweredByText: {
        fontSize: 11,
    },
    stripeLogo: {
        fontSize: 16,
        fontWeight: '900',
        fontFamily: 'Inter_900Black',
        letterSpacing: -0.5,
    },
    // Connect button
    connectButtonWrapper: {
        width: '100%',
    },
    connectButton: {
        width: '100%',
        height: 52,
        borderRadius: 14,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    connectButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    // Connecting state
    connectingView: {
        alignItems: 'center',
        paddingVertical: 40,
        gap: 16,
    },
    connectingText: {
        fontSize: 18,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    connectingSub: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
});
