import { useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getConnectOnboardingUrl } from '@/services/stripeService';
import { useTheme } from '@/hooks/useTheme';
import * as Linking from 'expo-linking';

export default function StripeRefreshScreen() {
    const { colors } = useTheme();
    useEffect(() => {
        (async () => {
            try {
                const { url } = await getConnectOnboardingUrl();
                await Linking.openURL(url);
            } catch (error: any) {
                Alert.alert('Could Not Resume Onboarding', error?.message || 'Please try again later.');
                router.replace('/(tabs)/messages');
            }
        })();
    }, []);
    return <View style={[styles.container, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.text} /><Text style={{ color: colors.textSecondary }}>Returning to Stripe…</Text></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 } });
