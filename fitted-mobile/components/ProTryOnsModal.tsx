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
    purchaseProTryOnsSubscription,
    restorePurchases,
    syncSubscriptionToSupabase,
    FREE_DAILY_TRYON_LIMIT,
} from '@/services/revenueCatService';

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

    const benefits = [
        'Unlimited daily dressing room try-ons',
        'Priority AI generation queue',
        'HD outfit renders',
        'No daily reset countdown',
    ];

    const handlePurchase = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const { success, error } = await purchaseProTryOnsSubscription();

            if (error === 'cancelled') return;

            if (!success) {
                if (error?.includes('not available')) {
                    Alert.alert(
                        'Development Mode',
                        'In-app purchases require a development build. Enable unlimited try-ons for testing?',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Enable for Testing',
                                onPress: async () => {
                                    const { error: dbError } = await supabase
                                        .from('users')
                                        .update({ subscription_status: 'pro_tryons' })
                                        .eq('id', user.id);

                                    if (!dbError) {
                                        setUser({ ...user, subscription_status: 'pro_tryons' as any });
                                        Alert.alert('✅ Enabled', 'Unlimited try-ons enabled for testing.');
                                        onClose();
                                    }
                                },
                            },
                        ]
                    );
                    return;
                }

                Alert.alert('Purchase Failed', error || 'Unable to complete purchase.');
                return;
            }

            await syncSubscriptionToSupabase(user.id, 'proTryOns', true);
            setUser({ ...user, subscription_status: 'pro_tryons' as any });
            Alert.alert('Upgraded! ✨', 'You now have unlimited dressing room try-ons.');
            onClose();
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
                await syncSubscriptionToSupabase(user.id, 'proTryOns', true);
                setUser({ ...user, subscription_status: 'pro_tryons' as any });
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
                            <MaterialCommunityIcons name="infinity" size={40} color="#fff" />
                        </LinearGradient>
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: colors.text }]}>
                        Unlimited{'\n'}Try-Ons
                    </Text>

                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Remove the {FREE_DAILY_TRYON_LIMIT}/day limit and try on as{'\n'}many outfits as you want.
                    </Text>

                    {/* Pricing card */}
                    <View style={[styles.pricingCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                        <View style={styles.pricingHeader}>
                            <Text style={[styles.pricingTitle, { color: colors.text }]}>Pro Try-Ons</Text>
                            <View style={styles.priceRow}>
                                <Text style={[styles.price, { color: colors.text }]}>$10</Text>
                                <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>/mo</Text>
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
                                <Text style={styles.purchaseButtonText}>Go Unlimited</Text>
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
                        Subscription renews monthly. Cancel anytime in your device settings.
                    </Text>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { width: '85%', maxWidth: 360, borderRadius: 24, padding: 24, paddingTop: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
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
