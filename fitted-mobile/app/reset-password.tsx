import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/hooks/useTheme';
import { applySupabaseAuthLink } from '@/services/authLinks';

export default function ResetPasswordScreen() {
    const { colors } = useTheme();
    const params = useLocalSearchParams<{ code?: string }>();
    const [ready, setReady] = useState(false);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            const initialUrl = await Linking.getInitialURL();
            const result = await applySupabaseAuthLink(initialUrl || (params.code ? `emode://reset-password?code=${encodeURIComponent(params.code)}` : null));
            if (result.error) Alert.alert('Invalid Link', 'This password-reset link is invalid or expired.');
            const { data } = await supabase.auth.getSession();
            setReady(!!data.session);
        })();
    }, [params.code]);

    const save = async () => {
        if (password.length < 8) return Alert.alert('Password Too Short', 'Use at least 8 characters.');
        if (password !== confirm) return Alert.alert('Passwords Do Not Match', 'Re-enter the same password.');
        setSaving(true);
        const { error } = await supabase.auth.updateUser({ password });
        setSaving(false);
        if (error) return Alert.alert('Could Not Update Password', error.message);
        Alert.alert('Password Updated', 'You can now use your new password.', [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }]);
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.content}>
                <Text style={[styles.title, { color: colors.text }]}>Reset password</Text>
                {!ready ? <Text style={[styles.message, { color: colors.textSecondary }]}>Open a fresh reset link from your email, or request another from the sign-in screen.</Text> : <>
                    <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="New password" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.input }]} />
                    <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Confirm new password" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.input }]} />
                    <Pressable onPress={save} disabled={saving} style={[styles.button, { backgroundColor: colors.primary }]}>{saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Update Password</Text>}</Pressable>
                </>}
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center' }, content: { padding: 24, gap: 12 },
    title: { fontSize: 28, fontWeight: '700', marginBottom: 8 }, message: { fontSize: 15, lineHeight: 22 },
    input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16 }, button: { borderRadius: 12, padding: 16, alignItems: 'center' },
});
