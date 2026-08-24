import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/hooks/useTheme';
import { LEGAL } from '@/constants/legal';

export default function LoginScreen() {
    const { colors } = useTheme();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const signIn = useAuthStore((state) => state.signIn);
    const signUp = useAuthStore((state) => state.signUp);
    const requestPasswordReset = useAuthStore((state) => state.requestPasswordReset);

    const submit = async () => {
        if (!email.trim() || !password) return Alert.alert('Missing Information', 'Enter your email and password.');
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('Invalid Email', 'Enter a valid email address.');
        if (!isLogin && !/^[a-zA-Z0-9_.]{3,30}$/.test(username.trim())) {
            return Alert.alert('Invalid Username', 'Use 3–30 letters, numbers, underscores, or periods.');
        }
        if (!isLogin && password.length < 8) return Alert.alert('Password Too Short', 'Use at least 8 characters.');
        if (!isLogin && !acceptedTerms) {
            return Alert.alert('Terms Required', 'Agree to the Terms of Use and Privacy Policy to create an account.');
        }

        setLoading(true);
        try {
            if (isLogin) {
                const { error } = await signIn(email.trim(), password);
                if (error) return Alert.alert('Sign In Failed', error);
                router.replace('/(tabs)');
                return;
            }

            const { error, needsEmailConfirmation } = await signUp(email.trim(), password, username.trim());
            if (error) return Alert.alert('Account Creation Failed', error);
            if (needsEmailConfirmation) {
                Alert.alert('Check Your Email', 'Open the confirmation link, then return here to sign in.');
                setIsLogin(true);
            } else {
                router.replace('/onboarding');
            }
        } finally {
            setLoading(false);
        }
    };

    const forgotPassword = async () => {
        if (!email.trim()) return Alert.alert('Email Required', 'Enter your account email first.');
        const { error } = await requestPasswordReset(email);
        Alert.alert(
            error ? 'Reset Failed' : 'Check Your Email',
            error || 'We sent password-reset instructions if an account matches that email.',
        );
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView
                contentContainerStyle={styles.inner}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.logoContainer}>
                    {/* The mark is a transparent glyph tinted to the theme's text
                        colour, so it reads on the white light theme and the cream
                        one without shipping a background with it. */}
                    <Image
                        source={require('@/assets/images/logo-e.png')}
                        style={styles.mark}
                        contentFit="contain"
                        tintColor={colors.text}
                    />
                    <Text style={[styles.logo, { color: colors.text }]}>emode</Text>
                    <Text style={[styles.tagline, { color: colors.textSecondary }]}>AI-Powered Virtual Try-On</Text>
                </View>

                <View style={styles.form}>
                    {!isLogin && <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]} placeholder="Username" placeholderTextColor={colors.placeholder} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={30} />}
                    <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]} placeholder="Email" placeholderTextColor={colors.placeholder} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
                    <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]} placeholder="Password" placeholderTextColor={colors.placeholder} value={password} onChangeText={setPassword} secureTextEntry textContentType={isLogin ? 'password' : 'newPassword'} />

                    {!isLogin && (
                        <View style={styles.termsRow}>
                            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acceptedTerms }} onPress={() => setAcceptedTerms((value) => !value)} style={[styles.checkbox, { borderColor: colors.inputBorder, backgroundColor: acceptedTerms ? colors.primary : 'transparent' }]}>
                                {acceptedTerms && <Text style={{ color: colors.primaryForeground }}>✓</Text>}
                            </Pressable>
                            <Text style={[styles.termsText, { color: colors.textSecondary }]}>I agree to the </Text>
                            <Pressable onPress={() => Linking.openURL(LEGAL.termsUrl)}><Text style={[styles.termsLink, { color: colors.text }]}>Terms</Text></Pressable>
                            <Text style={[styles.termsText, { color: colors.textSecondary }]}> and </Text>
                            <Pressable onPress={() => Linking.openURL(LEGAL.privacyPolicyUrl)}><Text style={[styles.termsLink, { color: colors.text }]}>Privacy Policy</Text></Pressable>
                        </View>
                    )}

                    <Pressable style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]} onPress={submit} disabled={loading}>
                        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{loading ? 'Loading…' : isLogin ? 'Sign In' : 'Create Account'}</Text>
                    </Pressable>
                </View>

                {isLogin && <Pressable onPress={forgotPassword}><Text style={[styles.forgotText, { color: colors.textSecondary }]}>Forgot password?</Text></Pressable>}
                <Pressable onPress={() => setIsLogin((value) => !value)}><Text style={[styles.toggleText, { color: colors.textSecondary }]}>{isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}</Text></Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    inner: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    logoContainer: { alignItems: 'center', marginBottom: 48 },
    mark: { width: 78, height: 89, marginBottom: 14 },
    logo: { fontSize: 48, fontWeight: '700', letterSpacing: -2 },
    tagline: { fontSize: 14, marginTop: 8 },
    form: { width: '100%', maxWidth: 340 },
    input: { borderRadius: 12, padding: 16, marginBottom: 12, fontSize: 16, borderWidth: 1 },
    termsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
    checkbox: { width: 22, height: 22, borderWidth: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    termsText: { fontSize: 12 },
    termsLink: { fontSize: 12, textDecorationLine: 'underline', fontWeight: '600' },
    button: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { fontSize: 16, fontWeight: '600' },
    forgotText: { marginTop: 16, fontSize: 14 },
    toggleText: { marginTop: 20, fontSize: 14 },
});
