import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import {
    purchaseStylistSubscription,
    restorePurchases,
    syncSubscriptionToSupabase,
} from '@/services/revenueCatService';

interface StylistModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function StylistModal({ visible, onClose }: StylistModalProps) {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);
    const setUser = useAuthStore((state) => state.setUser);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(false);

    const benefits = [
        'Blue Verified Badge on profile',
        'Process payments directly in DMs',
        'Rank on the "Featured Stylists" leaderboard',
    ];

    const handlePurchase = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const { success, error } = await purchaseStylistSubscription();

            if (error === 'cancelled') {
                // User cancelled — do nothing
                return;
            }

            if (!success) {
                // If RevenueCat isn't available (Expo Go), fall back to direct DB update for testing
                if (error?.includes('not available')) {
                    Alert.alert(
                        'Development Mode',
                        'In-app purchases require a development build. Enable stylist mode for testing?',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Enable for Testing',
                                onPress: async () => {
                                    const { error: dbError } = await supabase
                                        .from('users')
                                        .update({ is_verified_stylist: true, subscription_status: 'active' })
                                        .eq('id', user.id);

                                    if (!dbError) {
                                        setUser({ ...user, is_verified_stylist: true, subscription_status: 'active' });
                                        Alert.alert('✅ Enabled', 'Stylist mode enabled for testing. In production, this will require a real subscription.');
                                        onClose();
                                    } else {
                                        Alert.alert('Error', 'Failed to enable testing mode.');
                                    }
                                },
                            },
                        ]
                    );
                    return;
                }

                Alert.alert('Purchase Failed', error || 'Unable to complete purchase. Please try again.');
                return;
            }

            // Purchase succeeded — sync to Supabase
            await syncSubscriptionToSupabase(user.id, 'stylist', true);
            setUser({ ...user, is_verified_stylist: true, subscription_status: 'active' });

            Alert.alert('Congratulations! 🎉', 'You are now a Verified Stylist! You can start accepting styling requests.');
            onClose();
        } catch (error: any) {
            console.error('Purchase error:', error);
            Alert.alert('Error', error.message || 'An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!user) return;
        setRestoring(true);

        try {
            const { success, activeEntitlements, error } = await restorePurchases();

            if (!success) {
                if (error?.includes('not available')) {
                    Alert.alert('Not Available', 'In-app purchases require a development build.');
                } else {
                    Alert.alert('Restore Failed', error || 'Could not restore purchases.');
                }
                return;
            }

            const hasStylist = activeEntitlements.includes('verified_stylist');
            if (hasStylist) {
                await syncSubscriptionToSupabase(user.id, 'stylist', true);
                setUser({ ...user, is_verified_stylist: true, subscription_status: 'active' });
                Alert.alert('Restored!', 'Your Stylist subscription has been restored.');
                onClose();
            } else {
                Alert.alert('No Subscription', 'No active Stylist subscription found on this account.');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to restore purchases.');
        } finally {
            setRestoring(false);
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

                    {/* Icon */}
                    <View style={styles.iconWrapper}>
                        <View style={[styles.iconCircle, { backgroundColor: '#EBF4FF' }]}>
                            <MaterialCommunityIcons name="shield-check" size={40} color="#3b82f6" />
                        </View>
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: colors.text }]}>
                        Become a Verified{'\n'}Stylist
                    </Text>

                    {/* Subtitle */}
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Unlock professional tools and start{'\n'}earning from your style.
                    </Text>

                    {/* Pricing card */}
                    <View style={[styles.pricingCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                        <View style={styles.pricingHeader}>
                            <Text style={[styles.pricingTitle, { color: colors.text }]}>Stylist Subscription</Text>
                            <View style={styles.priceRow}>
                                <Text style={[styles.price, { color: colors.text }]}>$25</Text>
                                <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>/mo</Text>
                            </View>
                        </View>

                        {/* Benefits list */}
                        <View style={styles.benefitsList}>
                            {benefits.map((benefit, index) => (
                                <View key={index} style={styles.benefitItem}>
                                    <View style={[styles.checkCircle, { borderColor: '#3b82f6' }]}>
                                        <Feather name="check" size={12} color="#3b82f6" />
                                    </View>
                                    <Text style={[styles.benefitText, { color: colors.text }]}>{benefit}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Purchase button with gradient */}
                    <Pressable onPress={handlePurchase} disabled={loading || restoring} style={styles.purchaseButtonWrapper}>
                        <LinearGradient
                            colors={['#a855f7', '#7c3aed']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.purchaseButton, (loading || restoring) && styles.purchaseButtonDisabled]}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.purchaseButtonText}>Subscribe Now</Text>
                            )}
                        </LinearGradient>
                    </Pressable>

                    {/* Restore purchases link */}
                    <Pressable onPress={handleRestore} disabled={loading || restoring} style={styles.restoreButton}>
                        {restoring ? (
                            <ActivityIndicator color={colors.textTertiary} size="small" />
                        ) : (
                            <Text style={[styles.restoreText, { color: colors.textTertiary }]}>
                                Restore Purchases
                            </Text>
                        )}
                    </Pressable>

                    {/* Legal note */}
                    <Text style={[styles.legalText, { color: colors.textTertiary }]}>
                        Subscription renews monthly. Cancel anytime in your device settings.
                    </Text>
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
        width: '85%',
        maxWidth: 360,
        borderRadius: 24,
        padding: 24,
        paddingTop: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
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
    iconWrapper: {
        marginBottom: 20,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    pricingCard: {
        width: '100%',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        marginBottom: 20,
    },
    pricingHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    pricingTitle: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    price: {
        fontSize: 24,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    priceUnit: {
        fontSize: 14,
    },
    benefitsList: {
        gap: 12,
    },
    benefitItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    checkCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    benefitText: {
        fontSize: 14,
        flex: 1,
    },
    purchaseButtonWrapper: {
        width: '100%',
    },
    purchaseButton: {
        width: '100%',
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    purchaseButtonDisabled: {
        opacity: 0.6,
    },
    purchaseButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    restoreButton: {
        marginTop: 12,
        padding: 8,
    },
    restoreText: {
        fontSize: 13,
        textDecorationLine: 'underline',
    },
    legalText: {
        fontSize: 10,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 14,
    },
});
