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
    purchaseProTryOnsSubscription,
    restorePurchases,
    syncSubscriptionToSupabase,
    FREE_DAILY_TRYON_LIMIT,
    PRO_DAILY_TRYON_LIMIT,
    getSubscriptionPrice,
} from '@/services/revenueCatService';
import { LEGAL } from '@/constants/legal';

interface ProTryOnsModalProps {
    visible: boolean;
    onClose: () => void;
    remainingTryOns?: number;
}

export default function ProTryOnsModal({ visible, onClose, remainingTryOns = 0 }: ProTryOnsModalProps) {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);
    const setUser = useAuthStore((state) => state.setUser);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [price, setPrice] = useState<string | null>(null);

    useEffect(() => { if (visible) getSubscriptionPrice('proTryOns').then(setPrice); }, [visible]);

    const benefits = [
        `Up to ${PRO_DAILY_TRYON_LIMIT} AI try-ons each day`,
        'Combine up to 6 clothing references',
        'Private saved try-on history',
        'Access restored across your devices',
    ];

    const handlePurchase = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const { success, error } = await purchaseProTryOnsSubscription();

            if (error === 'cancelled') return;

            if (!success) {
                Alert.alert('Purchase Failed', error || 'Unable to complete purchase.');
                return;
            }

            // The server re-verifies with RevenueCat before granting.
            const flags = await syncSubscriptionToSupabase(user.id, 'proTryOns');
            if (flags?.has_pro_tryons) {
                setUser({ ...user, has_pro_tryons: true, subscription_status: flags.subscription_status });
                Alert.alert('Upgraded!', `You can now create up to ${PRO_DAILY_TRYON_LIMIT} AI try-ons each day.`);
                onClose();
            } else {
                Alert.alert('Almost there', 'Your purchase was received but we could not verify it yet. Tap "Restore Purchases" in a moment.');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'An error occurred.');
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
                Alert.alert('Restore Failed', error || 'Could not restore purchases.');
                return;
            }

            if (activeEntitlements.includes('pro_tryons')) {
                const flags = await syncSubscriptionToSupabase(user.id, 'proTryOns');
                setUser({ ...user, has_pro_tryons: !!flags?.has_pro_tryons, subscription_status: flags?.subscription_status || 'active' });
                Alert.alert('Restored!', 'Your Pro Try-Ons subscription has been restored.');
                onClose();
            } else {
                Alert.alert('No Subscription', 'No active Pro Try-Ons subscription found.');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to restore.');
        } finally {
            setRestoring(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />

                <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                    <Pressable style={styles.closeButton} onPress={onClose}>
                        <Feather name="x" size={24} color={colors.textSecondary} />
                    </Pressable>

                    {/* Limit reached indicator */}
                    {remainingTryOns <= 0 && (
                        <View style={styles.limitBanner}>
                            <Text style={styles.limitBannerText}>
                                Daily limit reached (0/{FREE_DAILY_TRYON_LIMIT})
                            </Text>
                        </View>
                    )}

                    {/* Icon */}
                    <View style={styles.iconWrapper}>
                        <LinearGradient colors={['#ec4899', '#be185d']} style={styles.iconCircle}>
                            <MaterialCommunityIcons name="creation" size={40} color="#fff" />
                        </LinearGradient>
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: colors.text }]}>
                        Pro{'\n'}Try-Ons
                    </Text>

                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Expand your allowance from {FREE_DAILY_TRYON_LIMIT} to {PRO_DAILY_TRYON_LIMIT} AI try-ons per day.
                    </Text>

                    {/* Pricing card */}
                    <View style={[styles.pricingCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                        <View style={styles.pricingHeader}>
                            <Text style={[styles.pricingTitle, { color: colors.text }]}>Pro Try-Ons</Text>
                            <View style={styles.priceRow}>
                                <Text style={[styles.price, { color: colors.text }]}>{price || 'Monthly'}</Text>
                                {price && <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>/month</Text>}
                            </View>
                        </View>

                        <View style={styles.benefitsList}>
                            {benefits.map((benefit, index) => (
                                <View key={index} style={styles.benefitItem}>
                                    <View style={[styles.checkCircle, { borderColor: '#ec4899' }]}>
                                        <Feather name="check" size={12} color="#ec4899" />
                                    </View>
                                    <Text style={[styles.benefitText, { color: colors.text }]}>{benefit}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Purchase button */}
                    <Pressable onPress={handlePurchase} disabled={loading || restoring} style={styles.purchaseButtonWrapper}>
                        <LinearGradient
                            colors={['#ec4899', '#be185d']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.purchaseButton, (loading || restoring) && styles.purchaseButtonDisabled]}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.purchaseButtonText}>Upgrade to Pro</Text>
                            )}
                        </LinearGradient>
                    </Pressable>

                    <Pressable onPress={handleRestore} disabled={loading || restoring} style={styles.restoreButton}>
                        {restoring ? (
                            <ActivityIndicator color={colors.textTertiary} size="small" />
                        ) : (
                            <Text style={[styles.restoreText, { color: colors.textTertiary }]}>
                                Restore Purchases
                            </Text>
                        )}
                    </Pressable>

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
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { width: '85%', maxWidth: 360, borderRadius: 24, padding: 24, paddingTop: 32, alignItems: 'center', boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.25)', elevation: 10 },
    closeButton: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
    limitBanner: { backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
    limitBannerText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
    iconWrapper: { marginBottom: 20 },
    iconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, fontWeight: '700', fontFamily: 'Inter_700Bold', textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
    pricingCard: { width: '100%', borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 20 },
    pricingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    pricingTitle: { fontSize: 16, fontWeight: '600', fontFamily: 'Inter_700Bold' },
    priceRow: { flexDirection: 'row', alignItems: 'baseline' },
    price: { fontSize: 24, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    priceUnit: { fontSize: 14 },
    benefitsList: { gap: 12 },
    benefitItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
    benefitText: { fontSize: 14, flex: 1 },
    purchaseButtonWrapper: { width: '100%' },
    purchaseButton: { width: '100%', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    purchaseButtonDisabled: { opacity: 0.6 },
    purchaseButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Inter_700Bold' },
    restoreButton: { marginTop: 12, padding: 8 },
    restoreText: { fontSize: 13, textDecorationLine: 'underline' },
    legalText: { fontSize: 10, textAlign: 'center', marginTop: 8, lineHeight: 14 },
});
