import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/hooks/useTheme';
import { LEGAL } from '@/constants/legal';

/**
 * What the server actually enforces on a new password.
 *
 * These mirror the Supabase project's password policy. Stating them up front is
 * the point: the rules used to be invisible until you failed, and the failure
 * was the raw server string, which reads out the entire permitted symbol set.
 */
const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
    { label: 'At least 8 characters', test: (v) => v.length >= 8 },
    { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
    { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
    { label: 'A number', test: (v) => /\d/.test(v) },
    { label: 'A symbol (!@#$…)', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/**
 * Turn an auth error into something a person can act on.
 *
 * Supabase's messages are written for developers -- the password one lists every
 * acceptable character -- and passing them straight to an alert is what made
 * this screen feel unfinished.
 */
function humanAuthError(raw: string): string {
    const message = raw.toLowerCase();
    if (message.includes('password should contain')) {
        return 'That password does not meet the requirements listed under the field.';
    }
    if (message.includes('password should be at least')) {
        return 'That password is too short — use at least 8 characters.';
    }
    if (message.includes('already registered') || message.includes('already been registered')) {
        return 'An account already exists for that email. Try signing in instead.';
    }
    if (message.includes('invalid login credentials')) {
        return 'That email and password do not match an account.';
    }
    if (message.includes('email not confirmed')) {
        return 'Confirm your email first — check your inbox for the link.';
    }
    if (message.includes('rate limit') || message.includes('too many')) {
        return 'Too many attempts. Wait a minute and try again.';
    }
    return raw;
}

/** The three things somebody gets, stated before they hand over an email. */
const PITCH: { icon: keyof typeof Feather.glyphMap; text: string }[] = [
    { icon: 'zap', text: 'Try on anything, then share the fit' },
    { icon: 'star', text: 'Style others, get styled, get paid' },
    { icon: 'shopping-bag', text: 'Sell your closet, try on theirs' },
];

export default function LoginScreen() {
    const { colors } = useTheme();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const signIn = useAuthStore((state) => state.signIn);
    const signUp = useAuthStore((state) => state.signUp);
    const requestPasswordReset = useAuthStore((state) => state.requestPasswordReset);

    const submit = async () => {
        if (!email.trim() || !password) return Alert.alert('Missing Information', 'Enter your email and password.');
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('Invalid Email', 'Enter a valid email address.');
        if (!isLogin && !/^[a-zA-Z0-9_.]{3,30}$/.test(username.trim())) {
            return Alert.alert('Invalid Username', 'Use 3–30 letters, numbers, underscores, or periods.');
        }
        if (!isLogin) {
            // Fail here rather than at the server, so the message can name the
            // one rule that is missing instead of reciting all of them.
            const missing = PASSWORD_RULES.filter((rule) => !rule.test(password));
            if (missing.length > 0) {
                return Alert.alert(
                    'Password Needs Work',
                    `Still missing: ${missing.map((rule) => rule.label.toLowerCase()).join(', ')}.`,
                );
            }
        }
        if (!isLogin && !acceptedTerms) {
            return Alert.alert('Terms Required', 'Agree to the Terms of Use and Privacy Policy to create an account.');
        }

        setLoading(true);
        try {
            if (isLogin) {
                const { error } = await signIn(email.trim(), password);
                if (error) return Alert.alert('Sign In Failed', humanAuthError(error));
                router.replace('/(tabs)');
                return;
            }

            const { error, needsEmailConfirmation } = await signUp(email.trim(), password, username.trim());
            if (error) return Alert.alert('Account Creation Failed', humanAuthError(error));
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
                    <Text style={[styles.tagline, { color: colors.textSecondary }]}>The world's first social ecosystem for fashion fanatics.</Text>

                    <View style={styles.pitch}>
                        {PITCH.map((line) => (
                            <View key={line.text} style={styles.pitchRow}>
                                <Feather name={line.icon} size={14} color={colors.textSecondary} />
                                <Text style={[styles.pitchText, { color: colors.textSecondary }]}>{line.text}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.form}>
                    {!isLogin && <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]} placeholder="Username" placeholderTextColor={colors.placeholder} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={30} />}
                    <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]} placeholder="Email" placeholderTextColor={colors.placeholder} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
                    <View style={styles.passwordWrap}>
                        <TextInput
                            style={[styles.input, styles.inputWithAction, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]}
                            placeholder="Password"
                            placeholderTextColor={colors.placeholder}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            textContentType={isLogin ? 'password' : 'newPassword'}
                        />
                        {/* Rules this strict are miserable to satisfy blind. */}
                        <Pressable
                            onPress={() => setShowPassword((value) => !value)}
                            style={styles.inputAction}
                            hitSlop={10}
                            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        >
                            <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    {/* The requirements, up front and ticking off live, rather than
                        as a wall of text after a rejected submit. */}
                    {!isLogin && (
                        <View style={styles.rules}>
                            {PASSWORD_RULES.map((rule) => {
                                const met = rule.test(password);
                                return (
                                    <View key={rule.label} style={styles.ruleRow}>
                                        <Feather
                                            name={met ? 'check-circle' : 'circle'}
                                            size={13}
                                            color={met ? '#10b981' : colors.textTertiary}
                                        />
                                        <Text style={[styles.ruleText, { color: met ? colors.textSecondary : colors.textTertiary }]}>
                                            {rule.label}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}

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
    logoContainer: { alignItems: 'center', marginBottom: 26 },
    mark: { width: 78, height: 89, marginBottom: 14 },
    logo: { fontSize: 48, fontWeight: '700', letterSpacing: -2 },
    tagline: { fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 300, lineHeight: 20 },
    pitch: { marginTop: 18, gap: 9, alignSelf: 'stretch', paddingHorizontal: 8 },
    pitchRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    pitchText: { fontSize: 13.5, flexShrink: 1 },
    form: { width: '100%', maxWidth: 340 },
    // The field's own bottom margin moves to the wrapper. Left on the input it
    // was inside the box the eye is centred against, so the icon sat half the
    // margin below the field's real centre.
    passwordWrap: { marginBottom: 12 },
    inputWithAction: { paddingRight: 44, marginBottom: 0 },
    inputAction: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
    rules: { marginTop: -4, marginBottom: 14, gap: 6, paddingHorizontal: 2 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    ruleText: { fontSize: 12.5 },
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
