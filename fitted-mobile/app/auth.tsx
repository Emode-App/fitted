import { StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, Alert, View as RNView, Text as RNText } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/hooks/useTheme';

export default function LoginScreen() {
    const { colors } = useTheme();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);

    const signIn = useAuthStore((state) => state.signIn);
    const signUp = useAuthStore((state) => state.signUp);

    const handleSubmit = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (!isLogin && !username) {
            Alert.alert('Error', 'Please enter a username');
            return;
        }

        if (!isLogin && password.length < 8) {
            Alert.alert('Error', 'Password must be at least 8 characters');
            return;
        }

        setLoading(true);

        try {
            if (isLogin) {
                const { error } = await signIn(email, password);
                if (error) {
                    Alert.alert('Error', error);
                } else {
                    router.replace('/(tabs)');
                }
            } else {
                const { error } = await signUp(email, password, username);
                if (error) {
                    Alert.alert('Error', error);
                } else {
                    Alert.alert('Success', 'Check your email to confirm your account!');
                    setIsLogin(true);
                }
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.container, { backgroundColor: colors.background }]}
        >
            <RNView style={[styles.inner, { backgroundColor: colors.background }]}>
                {/* Logo */}
                <RNView style={styles.logoContainer}>
                    <RNText style={[styles.logo, { color: colors.text }]}>emode</RNText>
                    <RNText style={[styles.tagline, { color: colors.textSecondary }]}>AI-Powered Virtual Try-On</RNText>
                </RNView>

                {/* Form */}
                <RNView style={styles.form}>
                    {!isLogin && (
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]}
                            placeholder="Username"
                            placeholderTextColor={colors.placeholder}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    )}

                    <TextInput
                        style={[styles.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder="Email"
                        placeholderTextColor={colors.placeholder}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />

                    <TextInput
                        style={[styles.input, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder="Password"
                        placeholderTextColor={colors.placeholder}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <Pressable
                        style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        <RNText style={[styles.buttonText, { color: colors.primaryForeground }]}>
                            {loading ? 'Loading...' : (isLogin ? 'Sign In' : 'Create Account')}
                        </RNText>
                    </Pressable>
                </RNView>

                {/* Toggle */}
                <Pressable onPress={() => setIsLogin(!isLogin)}>
                    <RNText style={[styles.toggleText, { color: colors.textSecondary }]}>
                        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                    </RNText>
                </Pressable>
            </RNView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    inner: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#000',
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 48,
        backgroundColor: 'transparent',
    },
    logo: {
        fontSize: 48,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: -2,
    },
    tagline: {
        fontSize: 14,
        color: '#888',
        marginTop: 8,
    },
    form: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: 'transparent',
    },
    input: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        fontSize: 16,
        color: '#fff',
        borderWidth: 1,
        borderColor: '#333',
    },
    button: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '600',
    },
    toggleText: {
        color: '#888',
        marginTop: 24,
        fontSize: 14,
    },
});
