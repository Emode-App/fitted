import { StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/stores/authStore';

export default function LoginScreen() {
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
            style={styles.container}
        >
            <View style={styles.inner}>
                {/* Logo */}
                <View style={styles.logoContainer}>
                    <Text style={styles.logo}>fitted</Text>
                    <Text style={styles.tagline}>AI-Powered Virtual Try-On</Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    {!isLogin && (
                        <TextInput
                            style={styles.input}
                            placeholder="Username"
                            placeholderTextColor="#666"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    )}

                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor="#666"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        placeholderTextColor="#666"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <Pressable
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>
                            {loading ? 'Loading...' : (isLogin ? 'Sign In' : 'Create Account')}
                        </Text>
                    </Pressable>
                </View>

                {/* Toggle */}
                <Pressable onPress={() => setIsLogin(!isLogin)}>
                    <Text style={styles.toggleText}>
                        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                    </Text>
                </Pressable>
            </View>
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
