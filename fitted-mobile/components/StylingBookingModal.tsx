import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/useTheme';
import { useStripeCheckout } from '@/hooks/useStripeCheckout';
import { createBookingIntent, getStylistRateCents } from '@/services/stylingSessions';
import { STRIPE_CONFIG, PLATFORM_CONFIG } from '@/constants/payments';
import { LEGAL } from '@/constants/legal';
import type { StylingSession, User } from '@/types';

interface Props {
    visible: boolean;
    stylist: User;
    conversationId: string;
    onClose: () => void;
    onBooked: (session: StylingSession) => void;
}

const DURATIONS = [30, 60, 90];

/**
 * Books a real-time 1:1 styling session.
 *
 * The card is AUTHORIZED here, not charged. Capture happens only when the
 * stylist delivers inside the live window, so a stylist who never shows costs
 * the client nothing. That framing is also what keeps this outside in-app
 * purchase under App Review Guideline 3.1.3(d).
 */
export default function StylingBookingModal({ visible, stylist, conversationId, onClose, onBooked }: Props) {
    const { colors, isDark } = useTheme();
    const { available, initPaymentSheet, presentPaymentSheet } = useStripeCheckout();
    const [rateCents, setRateCents] = useState<number | null>(null);
    const [duration, setDuration] = useState(60);
    const [loading, setLoading] = useState(false);
    const [loadingRate, setLoadingRate] = useState(true);

    useEffect(() => {
        if (!visible) return;
        setLoadingRate(true);
        getStylistRateCents(stylist.id)
            .then(setRateCents)
            .finally(() => setLoadingRate(false));
    }, [visible, stylist.id]);

    const price = rateCents != null ? `$${(rateCents / 100).toFixed(2)}` : null;

    const handleBook = async () => {
        if (!available) {
            Alert.alert('Not Available', 'Booking a session requires the installed app, not the web preview.');
            return;
        }
        setLoading(true);
        try {
            const intent = await createBookingIntent(stylist.id, conversationId, duration);

            const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'Emode',
                customerId: intent.customerId,
                customerEphemeralKeySecret: intent.ephemeralKey,
                paymentIntentClientSecret: intent.clientSecret,
                // Apple Pay and Cash App Pay both surface through the sheet via the
                // account's automatic payment methods — no per-method wiring here.
                applePay: { merchantCountryCode: 'US' },
                allowsDelayedPaymentMethods: false,
                returnURL: `${STRIPE_CONFIG.urlScheme}://stripe-return`,
            });
            if (initError) throw new Error(initError.message);

            const { error: sheetError } = await presentPaymentSheet();
            if (sheetError) {
                if (sheetError.code === 'Canceled') return;
                throw new Error(sheetError.message);
            }

            onBooked({
                id: intent.sessionId,
                stylist_id: stylist.id,
                client_id: '',
                conversation_id: conversationId,
                amount: intent.amount / 100,
                currency: intent.currency,
                status: 'scheduled',
                duration_minutes: intent.durationMinutes,
                created_at: new Date().toISOString(),
            } as StylingSession);
        } catch (error: any) {
            const message = error?.message || 'Could not book this session.';
            Alert.alert(
                message === 'stylist_not_connected' ? 'Stylist Unavailable' : 'Booking Failed',
                message === 'stylist_not_connected'
                    ? 'This stylist has not finished setting up payouts yet.'
                    : message,
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />

                <View style={[styles.card, { backgroundColor: colors.background }]}>
                    <Pressable style={styles.close} onPress={onClose}>
                        <Feather name="x" size={24} color={colors.textSecondary} />
                    </Pressable>

                    <View style={[styles.icon, { backgroundColor: '#EEF2FF' }]}>
                        <MaterialCommunityIcons name="hanger" size={36} color="#4f46e5" />
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>
                        Book {stylist.username}
                    </Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        A live one-to-one session. You and your stylist are in the chat
                        together for the whole window.
                    </Text>

                    {loadingRate ? (
                        <ActivityIndicator style={{ marginVertical: 28 }} color={colors.textSecondary} />
                    ) : rateCents == null ? (
                        <Text style={[styles.unavailable, { color: colors.textSecondary }]}>
                            This stylist hasn’t set a session price yet.
                        </Text>
                    ) : (
                        <>
                            <View style={[styles.priceCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                                <Text style={[styles.price, { color: colors.text }]}>{price}</Text>
                                <Text style={[styles.priceNote, { color: colors.textSecondary }]}>
                                    per session · includes the {PLATFORM_CONFIG.feePercent}% platform fee
                                </Text>
                            </View>

                            <Text style={[styles.label, { color: colors.textSecondary }]}>Session length</Text>
                            <View style={styles.durations}>
                                {DURATIONS.map((minutes) => {
                                    const selected = duration === minutes;
                                    return (
                                        <Pressable
                                            key={minutes}
                                            onPress={() => setDuration(minutes)}
                                            style={[
                                                styles.duration,
                                                {
                                                    borderColor: selected ? '#4f46e5' : colors.border,
                                                    backgroundColor: selected ? '#EEF2FF' : 'transparent',
                                                },
                                            ]}
                                        >
                                            <Text style={[styles.durationText, { color: selected ? '#4f46e5' : colors.text }]}>
                                                {minutes} min
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <Pressable onPress={handleBook} disabled={loading} style={{ width: '100%' }}>
                                <LinearGradient
                                    colors={['#6366f1', '#4f46e5']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={[styles.cta, loading && { opacity: 0.6 }]}
                                >
                                    {loading
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.ctaText}>Book for {price}</Text>}
                                </LinearGradient>
                            </Pressable>

                            <Text style={[styles.fine, { color: colors.textTertiary }]}>
                                Your card is authorized now and only charged once your stylist
                                delivers your look. If the session isn’t delivered, the hold is
                                released.{' '}
                                <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(LEGAL.termsUrl)}>Terms</Text>
                            </Text>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    card: { width: '85%', maxWidth: 360, borderRadius: 24, padding: 24, paddingTop: 32, alignItems: 'center', boxShadow: '0px 10px 20px rgba(0,0,0,0.25)', elevation: 10 },
    close: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
    icon: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
    title: { fontSize: 22, fontWeight: '700', fontFamily: 'Inter_700Bold', textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
    unavailable: { fontSize: 14, textAlign: 'center', marginVertical: 24 },
    priceCard: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 18, alignItems: 'center', marginBottom: 18 },
    price: { fontSize: 30, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    priceNote: { fontSize: 11, marginTop: 4, textAlign: 'center' },
    label: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', marginBottom: 8 },
    durations: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 20 },
    duration: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    durationText: { fontSize: 13, fontWeight: '600' },
    cta: { width: '100%', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    ctaText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Inter_700Bold' },
    fine: { fontSize: 10, textAlign: 'center', marginTop: 12, lineHeight: 14 },
});
