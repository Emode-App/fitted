import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { checkConnectStatus } from '@/services/stripeService';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/hooks/useTheme';

export default function StripeReturnScreen() {
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);
    const [ready, setReady] = useState<boolean | null>(null);
    useEffect(() => {
        if (!user?.id) return;
        checkConnectStatus(user.id).then((status) => setReady(status.onboardingComplete));
    }, [user?.id]);
    return <View style={[styles.container, { backgroundColor: colors.background }]}>
        {ready === null ? <ActivityIndicator color={colors.text} /> : <>
            <Text style={[styles.title, { color: colors.text }]}>{ready ? 'Seller payouts are ready' : 'Stripe needs more information'}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{ready ? 'You can now receive eligible marketplace payouts.' : 'Return to seller setup to finish the requirements shown by Stripe.'}</Text>
            <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.replace('/(tabs)/messages')}><Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Continue</Text></Pressable>
        </>}
    </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }, title: { fontSize: 24, fontWeight: '700', textAlign: 'center' }, body: { fontSize: 15, lineHeight: 22, textAlign: 'center' }, button: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 } });
