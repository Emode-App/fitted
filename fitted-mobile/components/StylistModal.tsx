import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';

interface StylistModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function StylistModal({ visible, onClose }: StylistModalProps) {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);
    const setUser = useAuthStore((state) => state.setUser);
    const [loading, setLoading] = useState(false);

    const benefits = [
        'Blue Verified Badge on profile',
        'Process payments directly in DMs',
        'Rank on the "Featured Stylists" leaderboard',
    ];

    const handlePurchase = async () => {
        if (!user) return;

        setLoading(true);
        try {
            // TODO: Integrate actual payment processing (Stripe, RevenueCat, etc.)
            // For now, we'll just update the user's stylist status

            const { error } = await supabase
                .from('users')
                .update({ is_verified_stylist: true })
                .eq('id', user.id);

            if (error) {
                console.error('Error updating stylist status:', error);
                alert('Failed to process verification. Please try again.');
            } else {
                setUser({ ...user, is_verified_stylist: true });
                alert('Congratulations! You are now a Verified Stylist! 🎉');
                onClose();
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred. Please try again.');
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
                    <Pressable onPress={handlePurchase} disabled={loading} style={styles.purchaseButtonWrapper}>
                        <LinearGradient
                            colors={['#a855f7', '#7c3aed']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.purchaseButton, loading && styles.purchaseButtonDisabled]}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.purchaseButtonText}>Purchase Verification</Text>
                            )}
                        </LinearGradient>
                    </Pressable>
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
});
