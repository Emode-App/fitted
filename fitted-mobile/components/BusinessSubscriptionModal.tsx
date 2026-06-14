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
import {
    purchaseBusinessSubscription,
    restorePurchases,
    syncSubscriptionToSupabase,
} from '@/services/revenueCatService';

interface BusinessSubscriptionModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function BusinessSubscriptionModal({ visible, onClose }: BusinessSubscriptionModalProps) {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);
    const setUser = useAuthStore((state) => state.setUser);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(false);

    const benefits = [
        'Embedded shop on your profile',
        'Product listings & inventory management',
        'Visitor count & analytics dashboard',
        'Green verified boutique badge',
    ];

    const handlePurchase = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const { success, error } = await purchaseBusinessSubscription();

            if (error === 'cancelled') return;

            if (!success) {
                Alert.alert('Purchase Failed', error || 'Unable to complete purchase.');
                return;
            }

            // The server re-verifies with RevenueCat before granting.
            const flags = await syncSubscriptionToSupabase(user.id, 'business');
            if (flags?.is_business_account) {
                setUser({ ...user, is_business_account: true });
                Alert.alert('Welcome to Business! 🏪', 'Your shop is now live on your profile.');
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

            if (activeEntitlements.includes('business_account')) {
                const flags = await syncSubscriptionToSupabase(user.id, 'business');
                setUser({ ...user, is_business_account: !!flags?.is_business_account });
                Alert.alert('Restored!', 'Your Business subscription has been restored.');
                onClose();
            } else {
                Alert.alert('No Subscription', 'No active Business subscription found.');
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

                    {/* Icon */}
                    <View style={styles.iconWrapper}>
                        <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.iconCircle}>
                            <MaterialCommunityIcons name="storefront-outline" size={40} color="#fff" />
                        </LinearGradient>
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: colors.text }]}>
                        Open Your{'\n'}Shop
                    </Text>

                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Turn your profile into a storefront{'\n'}and sell directly to your audience.
                    </Text>

                    {/* Pricing card */}
                    <View style={[styles.pricingCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                        <View style={styles.pricingHeader}>
                            <Text style={[styles.pricingTitle, { color: colors.text }]}>Business Account</Text>
                            <View style={styles.priceRow}>
                                <Text style={[styles.price, { color: colors.text }]}>$15</Text>
                                <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>/mo</Text>
                            </View>
                        </View>

                        <View style={styles.benefitsList}>
                            {benefits.map((benefit, index) => (
                                <View key={index} style={styles.benefitItem}>
                                    <View style={[styles.checkCircle, { borderColor: '#f59e0b' }]}>
                                        <Feather name="check" size={12} color="#f59e0b" />
                                    </View>
                                    <Text style={[styles.benefitText, { color: colors.text }]}>{benefit}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Purchase button */}
                    <Pressable onPress={handlePurchase} disabled={loading || restoring} style={styles.purchaseButtonWrapper}>
                        <LinearGradient
                            colors={['#f59e0b', '#d97706']}
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
