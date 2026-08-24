import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    ActivityIndicator,
    Alert,
    Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import {
    purchaseStylistSubscription,
    restorePurchases,
    syncSubscriptionToSupabase,
    getSubscriptionPrice,
} from '@/services/revenueCatService';
import { LEGAL } from '@/constants/legal';

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
    const [price, setPrice] = useState<string | null>(null);

    useEffect(() => { if (visible) getSubscriptionPrice('stylist').then(setPrice); }, [visible]);

    const benefits = [
        'Verified stylist badge on your profile',
        'Set a public styling rate',
        'Receive styling inquiries in messages',
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
                Alert.alert('Purchase Failed', error || 'Unable to complete purchase. Please try again.');
                return;
            }

            // Purchase succeeded — the server re-verifies with RevenueCat before
            // granting the entitlement (clients can no longer set it themselves).
            const flags = await syncSubscriptionToSupabase(user.id, 'stylist');
            if (flags?.is_verified_stylist) {
                setUser({ ...user, is_verified_stylist: true, subscription_status: flags.subscription_status as any });
                Alert.alert('Congratulations! 🎉', 'You are now a Verified Stylist and can receive styling inquiries.');
                onClose();
            } else {
                Alert.alert('Almost there', 'Your purchase was received but we could not verify it yet. Tap "Restore Purchases" in a moment.');
            }
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
                const flags = await syncSubscriptionToSupabase(user.id, 'stylist');
                setUser({ ...user, is_verified_stylist: !!flags?.is_verified_stylist, subscription_status: (flags?.subscription_status as any) || 'active' });
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
                        Showcase your credentials and connect{'\n'}with people seeking style advice.
                    </Text>

                    {/* Pricing card */}
                    <View style={[styles.pricingCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                        <View style={styles.pricingHeader}>
                            <Text style={[styles.pricingTitle, { color: colors.text }]}>Stylist Subscription</Text>
                            <View style={styles.priceRow}>
                                <Text style={[styles.price, { color: colors.text }]}>{price || 'Monthly'}</Text>
                                {price && <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>/month</Text>}
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
                        Renews monthly until canceled in store settings.{' '}
                        <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(LEGAL.termsUrl)}>Terms</Text>{' · '}
                        <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(LEGAL.privacyPolicyUrl)}>Privacy</Text>
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
        // Stacked, not a space-between row. The row put a 16pt title and a 24pt
        // price on one line with no gap and no flex on either, so
        // "Stylist Subscription" and "$24.99" ran straight into each other --
        // and any longer price or localised currency makes it worse.
        marginBottom: 16,
        gap: 2,
    },
    pricingTitle: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
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
