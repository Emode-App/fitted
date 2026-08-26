import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, TextInput, Pressable, Alert, ActivityIndicator, Platform, Linking, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import { LEGAL } from '@/constants/legal';
import { createOrderPayment } from '@/services/orderService';
import DressingRoom from '@/components/DressingRoom';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { registerForPush } from '@/services/pushNotifications';
import { revokeAiFaceConsent } from '@/services/privacyService';
import { submitSupportRequest } from '@/services/supportService';
import { useStripeCheckout } from '@/hooks/useStripeCheckout';
import StripeConnectOnboarding from '@/components/StripeConnectOnboarding';
import { checkConnectStatus, getConnectLoginUrl } from '@/services/stripeService';
import { getOwnPortfolio, requestPortfolioItem } from '@/services/portfolio';

interface LoginSession {
    id: string;
    device_name: string;
    device_type: string;
    platform: string;
    logged_in_at: string;
}

// --- Shared Components ---

const Header = ({ title, onBack }: { title: string; onBack: () => void }) => {
    const { colors } = useTheme();
    return (
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <Feather name="arrow-left" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
            <View style={{ width: 40 }} />
        </View>
    );
};

const SectionTitle = ({ title }: { title: string }) => {
    const { colors, isDark } = useTheme();
    return (
        <Text style={[
            styles.sectionTitle,
            { color: isDark ? '#71717a' : '#9ca3af' } // text-gray-400 dark:text-zinc-500
        ]}>
            {title}
        </Text>
    );
};

const ToggleRow = ({ label, subtext, value, onValueChange }: { label: string; subtext?: string; value: boolean; onValueChange: (v: boolean) => void }) => {
    const { colors, isDark } = useTheme();
    return (
        <View style={[styles.toggleRow, { borderBottomColor: isDark ? '#27272a' : '#f9fafb' }]}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
                {subtext && <Text style={[styles.toggleSubtext, { color: isDark ? '#71717a' : '#6b7280' }]}>{subtext}</Text>}
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: isDark ? '#3f3f46' : '#e5e7eb', true: isDark ? '#ffffff' : '#000000' }}
                thumbColor={isDark ? '#000000' : '#ffffff'}
                ios_backgroundColor={isDark ? '#3f3f46' : '#e5e7eb'}
            />
        </View>
    );
};

const MenuLink = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => {
    const { colors, isDark } = useTheme();
    return (
        <TouchableOpacity
            style={[styles.menuLink, { backgroundColor: isDark ? '#27272a' : '#f9fafb' }]}
            onPress={onPress}
        >
            <View style={styles.menuLinkLeft}>
                <Feather name={icon as any} size={20} color={colors.textSecondary} />
                <Text style={[styles.menuLinkLabel, { color: colors.text }]}>{label}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
    );
};

// --- Page Components ---

// 4. Privacy & Security
export const PrivacyPage = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (view: any) => void }) => {
    const { colors, isDark } = useTheme();
    const { user, updateProfile, setUser } = useAuthStore();
    const [showActivity, setShowActivity] = useState(user?.show_activity_status ?? true);
    const [revoking, setRevoking] = useState(false);

    const handleActivityChange = (value: boolean) => {
        setShowActivity(value);
        updateProfile({ show_activity_status: value });
    };

    const handleRevokeAiConsent = () => Alert.alert(
        'Remove AI Face Data?',
        'This removes your saved face photo, private generated try-ons, and face photos you shared in messages. Published posts are not removed. You can opt in again later.',
        [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove Data', style: 'destructive', onPress: async () => {
                    setRevoking(true);
                    try {
                        await revokeAiFaceConsent();
                        if (user) setUser({ ...user, ai_face_url: undefined });
                        Alert.alert('AI Face Data Removed', 'Consent was revoked and private face-derived data was deleted.');
                    } catch (error: any) {
                        Alert.alert('Could Not Remove Data', error?.message || 'Please try again.');
                    } finally {
                        setRevoking(false);
                    }
                },
            },
        ],
    );

    return (
        <>
            <Header title="Privacy & Security" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <SectionTitle title="Visibility" />
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6' }]}>
                    <ToggleRow
                        label="Show Activity Status"
                        value={showActivity}
                        onValueChange={handleActivityChange}
                    />
                </View>

                {/* Data & Security Group */}
                <View style={{ height: 24 }} />
                <SectionTitle title="Data & Security" />
                <View style={{ gap: 12 }}>
                    <MenuLink icon="monitor" label="Login Activity" onPress={() => onNavigate('loginActivity')} />
                    <MenuLink icon="shield" label="Privacy Policy" onPress={() => Linking.openURL(LEGAL.privacyPolicyUrl)} />
                    <MenuLink icon="file-text" label="Terms of Use" onPress={() => Linking.openURL(LEGAL.termsUrl)} />
                    <MenuLink
                        icon="credit-card"
                        label="Manage Subscriptions"
                        onPress={() => Linking.openURL(
                            Platform.OS === 'ios'
                                ? 'itms-apps://apps.apple.com/account/subscriptions'
                                : Platform.OS === 'android'
                                    ? 'https://play.google.com/store/account/subscriptions?package=com.emode.app'
                                    : LEGAL.supportUrl,
                        )}
                    />
                    <TouchableOpacity
                        disabled={revoking}
                        style={[styles.menuLink, { backgroundColor: isDark ? '#27272a' : '#f9fafb' }]}
                        onPress={handleRevokeAiConsent}
                    >
                        <View style={styles.menuLinkLeft}>
                            <Feather name="trash-2" size={20} color="#dc2626" />
                            <Text style={[styles.menuLinkLabel, { color: '#dc2626' }]}>{revoking ? 'Removing AI face data…' : 'Revoke AI Face Consent'}</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </>
    );
};

// 5. Two-Factor Auth
export const TwoFactorPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();
    const [loading, setLoading] = useState(true);
    const [isEnrolled, setIsEnrolled] = useState(false);
    const [enrolledFactorId, setEnrolledFactorId] = useState<string | null>(null);
    const [step, setStep] = useState<'idle' | 'qr' | 'verify'>('idle');
    const [qrUri, setQrUri] = useState('');
    const [secret, setSecret] = useState('');
    const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        (async () => {
            const { data } = await supabase.auth.mfa.listFactors();
            const verified = (data?.totp ?? []).find((f: any) => f.status === 'verified');
            if (verified) {
                setIsEnrolled(true);
                setEnrolledFactorId(verified.id);
            }
            setLoading(false);
        })();
    }, []);

    const handleEnroll = async () => {
        setActionLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
            if (error) throw error;
            setQrUri(data.totp.uri);
            setSecret(data.totp.secret);
            setPendingFactorId(data.id);
            setStep('qr');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleVerify = async () => {
        if (!pendingFactorId || code.length !== 6) return;
        setActionLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pendingFactorId, code });
            if (error) throw error;
            setIsEnrolled(true);
            setEnrolledFactorId(pendingFactorId);
            setStep('idle');
            setCode('');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDisable = () => {
        Alert.alert(
            'Disable Two-Factor Auth',
            'This will remove authenticator app protection from your account.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disable', style: 'destructive',
                    onPress: async () => {
                        if (!enrolledFactorId) return;
                        setActionLoading(true);
                        const { error } = await supabase.auth.mfa.unenroll({ factorId: enrolledFactorId });
                        if (error) setError(error.message);
                        else { setIsEnrolled(false); setEnrolledFactorId(null); }
                        setActionLoading(false);
                    }
                }
            ]
        );
    };

    const handleCancelEnroll = async () => {
        if (pendingFactorId) await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
        setPendingFactorId(null);
        setStep('idle');
        setCode('');
        setError(null);
    };

    if (loading) {
        return (
            <>
                <Header title="Two-Factor Auth" onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={colors.text} />
                </View>
            </>
        );
    }

    return (
        <>
            <Header title="Two-Factor Auth" onBack={onBack} />
            <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {/* Hero */}
                <View style={{ alignItems: 'center', marginVertical: 32 }}>
                    <View style={{
                        width: 80, height: 80, borderRadius: 40,
                        backgroundColor: isEnrolled ? (isDark ? '#14532d' : '#dcfce7') : (isDark ? '#1e3a8a' : '#dbeafe'),
                        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                    }}>
                        <Feather name="shield" size={40} color={isEnrolled ? '#22c55e' : '#2563eb'} />
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
                        {isEnrolled ? '2FA is Active' : 'Add extra security'}
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
                        {isEnrolled
                            ? 'Your account is protected with an authenticator app.'
                            : 'Protect your account with an additional layer of security.'}
                    </Text>
                </View>

                {/* Idle: status card */}
                {step === 'idle' && (
                    <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', padding: 16 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <Feather name="smartphone" size={20} color={colors.textSecondary} />
                                <View>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Authenticator App</Text>
                                    <Text style={{ fontSize: 12, color: isEnrolled ? '#22c55e' : colors.textSecondary }}>
                                        {isEnrolled ? 'Enabled' : 'Not set up'}
                                    </Text>
                                </View>
                            </View>
                            {isEnrolled ? (
                                <TouchableOpacity onPress={handleDisable} disabled={actionLoading}>
                                    <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600' }}>
                                        {actionLoading ? '...' : 'Disable'}
                                    </Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity onPress={handleEnroll} disabled={actionLoading}>
                                    <Text style={{ fontSize: 13, color: '#2563eb', fontWeight: '600' }}>
                                        {actionLoading ? '...' : 'Set Up'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {/* QR code step */}
                {step === 'qr' && (
                    <View style={{ gap: 20 }}>
                        <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', padding: 20, alignItems: 'center', gap: 16 }]}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
                                Scan with your authenticator app
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                                Use Google Authenticator, Authy, or any TOTP app
                            </Text>
                            <View style={{ backgroundColor: '#ffffff', padding: 16, borderRadius: 12 }}>
                                <QRCode value={qrUri} size={180} />
                            </View>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
                                Can't scan? Enter this code manually:
                            </Text>
                            <View style={{ backgroundColor: isDark ? '#27272a' : '#f3f4f6', borderRadius: 8, padding: 12, width: '100%' }}>
                                <Text style={{
                                    fontSize: 13,
                                    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                                    fontWeight: '600', color: colors.text, textAlign: 'center', letterSpacing: 2,
                                }}>
                                    {secret}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: isDark ? '#ffffff' : '#000000' }]}
                            onPress={() => setStep('verify')}
                        >
                            <Text style={{ color: isDark ? '#000000' : '#ffffff', fontWeight: '600' }}>Next: Enter Code</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleCancelEnroll} style={{ alignItems: 'center', padding: 12 }}>
                            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Verify step */}
                {step === 'verify' && (
                    <View style={{ gap: 20 }}>
                        <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', padding: 20, gap: 16 }]}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Enter the 6-digit code</Text>
                            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                Open your authenticator app and enter the code shown
                            </Text>
                            <TextInput
                                style={[styles.input, {
                                    backgroundColor: isDark ? '#27272a' : '#f9fafb',
                                    color: colors.text,
                                    borderColor: isDark ? '#3f3f46' : '#e5e7eb',
                                    textAlign: 'center', fontSize: 28, letterSpacing: 12, fontWeight: '700',
                                }]}
                                value={code}
                                onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                                keyboardType="number-pad"
                                maxLength={6}
                                placeholder="000000"
                                placeholderTextColor={colors.placeholder}
                                autoFocus
                            />
                            {error && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Feather name="alert-circle" size={14} color="#ef4444" />
                                    <Text style={{ color: '#ef4444', fontSize: 13 }}>{error}</Text>
                                </View>
                            )}
                        </View>
                        <TouchableOpacity
                            style={[styles.button, {
                                backgroundColor: code.length === 6
                                    ? (isDark ? '#ffffff' : '#000000')
                                    : (isDark ? '#3f3f46' : '#e5e7eb'),
                            }]}
                            onPress={handleVerify}
                            disabled={code.length !== 6 || actionLoading}
                        >
                            {actionLoading
                                ? <ActivityIndicator color={code.length === 6 ? (isDark ? '#000' : '#fff') : colors.textSecondary} />
                                : <Text style={{ color: code.length === 6 ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary, fontWeight: '600' }}>
                                    Enable 2FA
                                </Text>
                            }
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setStep('qr'); setError(null); setCode(''); }} style={{ alignItems: 'center', padding: 12 }}>
                            <Text style={{ color: colors.textSecondary }}>Back to QR Code</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {error && step === 'idle' && (
                    <Text style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 16 }}>{error}</Text>
                )}
            </ScrollView>
        </>
    );
};

// 6. Login Activity
export const LoginActivityPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();
    const { user, currentSessionId, signOut } = useAuthStore();
    const [sessions, setSessions] = useState<LoginSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            if (!user?.id) { setLoading(false); return; }
            const { data } = await supabase
                .from('login_sessions')
                .select('*')
                .eq('user_id', user.id)
                .order('logged_in_at', { ascending: false })
                .limit(20);
            if (data) setSessions(data as LoginSession[]);
            setLoading(false);
        })();
    }, [user?.id]);

    const handleRemoveSession = (session: LoginSession) => {
        if (session.id === currentSessionId) {
            Alert.alert('Log Out', 'Log out of this device?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: () => signOut() },
            ]);
        } else {
            Alert.alert('Session Security', 'For security, emode signs out all other devices together. Use “Sign Out All Other Devices” below.');
        }
    };

    const signOutOtherDevices = () => Alert.alert(
        'Sign Out Other Devices?',
        'This revokes refresh access for every other signed-in device. This device stays signed in.',
        [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out Others', style: 'destructive', onPress: async () => {
                    const { error } = await supabase.auth.signOut({ scope: 'others' });
                    if (error) return Alert.alert('Could Not Sign Out Devices', error.message);
                    if (user?.id) {
                        let query = supabase.from('login_sessions').delete().eq('user_id', user.id);
                        if (currentSessionId) query = query.neq('id', currentSessionId);
                        await query;
                    }
                    setSessions((items) => items.filter((item) => item.id === currentSessionId));
                    Alert.alert('Other Devices Signed Out', 'Existing access tokens may remain valid briefly, but they cannot be refreshed.');
                },
            },
        ],
    );

    const formatTime = (ts: string) => {
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 2) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hrs < 24) return `${hrs}h ago`;
        if (days === 1) return 'Yesterday';
        return new Date(ts).toLocaleDateString();
    };

    if (loading) {
        return (
            <>
                <Header title="Login Activity" onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={colors.text} />
                </View>
            </>
        );
    }

    if (sessions.length === 0) {
        return (
            <>
                <Header title="Login Activity" onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                    <Feather name="monitor" size={48} color={colors.textTertiary} />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 16 }}>No sessions recorded</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8 }}>
                        Login activity will appear here after your next sign-in.
                    </Text>
                </View>
            </>
        );
    }

    return (
        <>
            <Header title="Login Activity" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <Text style={[styles.sectionTitle, { color: isDark ? '#71717a' : '#9ca3af', marginBottom: 16 }]}>
                    Recent Sign-ins
                </Text>
                {sessions.map((session) => {
                    const isCurrent = session.id === currentSessionId;
                    const isPhone = session.device_type === 'phone';
                    return (
                        <View
                            key={session.id}
                            style={{
                                flexDirection: 'row', alignItems: 'center',
                                paddingVertical: 16, borderBottomWidth: 1,
                                borderBottomColor: isDark ? '#27272a' : '#f3f4f6',
                            }}
                        >
                            <View style={{
                                width: 40, height: 40, borderRadius: 20,
                                backgroundColor: isCurrent
                                    ? (isDark ? '#14532d' : '#dcfce7')
                                    : (isDark ? '#27272a' : '#f3f4f6'),
                                alignItems: 'center', justifyContent: 'center', marginRight: 14,
                            }}>
                                <Feather
                                    name={isPhone ? 'smartphone' : 'monitor'}
                                    size={18}
                                    color={isCurrent ? '#22c55e' : colors.textSecondary}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                                        {session.device_name}
                                    </Text>
                                    {isCurrent && (
                                        <View style={{
                                            backgroundColor: isDark ? '#14532d' : '#dcfce7',
                                            borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
                                        }}>
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a' }}>THIS DEVICE</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={{
                                    fontSize: 13,
                                    color: isCurrent ? '#10b981' : colors.textSecondary,
                                    fontWeight: isCurrent ? '600' : '400', marginTop: 2,
                                }}>
                                    {isCurrent ? 'Active now' : formatTime(session.logged_in_at)}
                                </Text>
                                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>
                                    {session.platform === 'ios' ? 'iOS' : session.platform === 'android' ? 'Android' : session.platform}
                                </Text>
                            </View>
                            {isCurrent && <TouchableOpacity onPress={() => handleRemoveSession(session)} hitSlop={12}>
                                <Text style={{
                                    fontSize: 13,
                                    color: isCurrent ? '#ef4444' : colors.textSecondary,
                                    fontWeight: '600',
                                }}>
                                    Log Out
                                </Text>
                            </TouchableOpacity>}
                        </View>
                    );
                })}
                {sessions.some((session) => session.id !== currentSessionId) && (
                    <Pressable style={[styles.button, { backgroundColor: '#dc2626', marginTop: 24 }]} onPress={signOutOtherDevices}>
                        <Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}>Sign Out All Other Devices</Text>
                    </Pressable>
                )}
            </ScrollView>
        </>
    );
};

// 7. Notifications
export const NotificationsPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);
    const [preferences, setPreferences] = useState({ likes: true, comments: true, follows: true, orders: true, messages: true, styling: true });
    const [loading, setLoading] = useState(true);
    const [enablingPush, setEnablingPush] = useState(false);

    useEffect(() => {
        (async () => {
            if (!user?.id) return setLoading(false);
            const { data } = await supabase.from('user_settings').select('notification_preferences').eq('user_id', user.id).single();
            if (data?.notification_preferences) setPreferences((current) => ({ ...current, ...data.notification_preferences }));
            setLoading(false);
        })();
    }, [user?.id]);

    const save = async (next: typeof preferences) => {
        if (!user?.id) return;
        const previous = preferences;
        setPreferences(next);
        const { error } = await supabase.from('user_settings').update({
            notification_preferences: next,
            updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
        if (error) {
            setPreferences(previous);
            Alert.alert('Could Not Save', 'Your notification preference was not changed.');
        }
    };

    const pauseAll = !Object.values(preferences).some(Boolean);
    const setPreference = (key: keyof typeof preferences, value: boolean) => save({ ...preferences, [key]: value });

    return (
        <>
            <Header title="Notifications" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                {loading ? <ActivityIndicator color={colors.text} /> : <>
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', marginBottom: 24 }]}>
                    <ToggleRow label="Pause All" value={pauseAll} onValueChange={(value) => save(value
                        ? { likes: false, comments: false, follows: false, orders: false, messages: false, styling: false }
                        : { likes: true, comments: true, follows: true, orders: true, messages: true, styling: true })} />
                </View>

                <SectionTitle title="Interactions" />
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', marginBottom: 24 }]}>
                    <ToggleRow label="Likes" value={preferences.likes} onValueChange={(value) => setPreference('likes', value)} />
                    <ToggleRow label="Comments" value={preferences.comments} onValueChange={(value) => setPreference('comments', value)} />
                    <ToggleRow label="New Followers" value={preferences.follows} onValueChange={(value) => setPreference('follows', value)} />
                </View>

                <SectionTitle title="Messages & Styling" />
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', marginBottom: 24 }]}>
                    <ToggleRow label="Direct Messages" value={preferences.messages} onValueChange={(value) => setPreference('messages', value)} />
                    <ToggleRow label="Styling Sessions" value={preferences.styling} onValueChange={(value) => setPreference('styling', value)} />
                </View>

                <SectionTitle title="Marketplace" />
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6' }]}>
                    <ToggleRow label="Order Updates" value={preferences.orders} onValueChange={(value) => setPreference('orders', value)} />
                </View>
                <Pressable
                    disabled={enablingPush || !user?.id}
                    style={[styles.button, { backgroundColor: colors.primary, marginTop: 24 }]}
                    onPress={async () => {
                        if (!user?.id) return;
                        setEnablingPush(true);
                        const enabled = await registerForPush(user.id);
                        setEnablingPush(false);
                        Alert.alert(enabled ? 'Push Notifications Enabled' : 'Permission Not Granted', enabled
                            ? 'This device can now receive the categories enabled above.'
                            : 'You can allow notifications later in your device settings.');
                    }}
                >
                    {enablingPush ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontWeight: '600', textAlign: 'center' }}>Enable Push Notifications on This Device</Text>}
                </Pressable>
                </>}
            </ScrollView>
        </>
    );
};

// 8. Appearance
export const AppearancePage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark, mode, setMode } = useTheme();

    const ThemeButton = ({ id, label, icon, swatch }: { id: string; label: string; icon?: string; swatch?: string }) => {
        const isSelected = mode === id;
        return (
            <Pressable
                style={[
                    styles.themeButton,
                    {
                        backgroundColor: isSelected ? (isDark ? '#27272a' : '#f9fafb') : 'transparent',
                        borderColor: isSelected ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#27272a' : '#e5e7eb')
                    }
                ]}
                onPress={() => setMode(id as any)}
            >
                {swatch ? (
                    <View style={[styles.themeSwatch, { backgroundColor: swatch }]} />
                ) : (
                    <Feather name={icon as any} size={24} color={isSelected ? colors.text : colors.textSecondary} />
                )}
                <Text style={{ fontSize: 13, fontWeight: '600', color: isSelected ? colors.text : colors.textSecondary }}>{label}</Text>
            </Pressable>
        );
    };

    return (
        <>
            <Header title="Appearance" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <View style={styles.themeContainer}>
                    <ThemeButton id="light" label="Light" icon="sun" />
                    <ThemeButton id="dark" label="Dark" icon="moon" />
                    <ThemeButton id="system" label="System" icon="monitor" />
                    <ThemeButton id="emode" label="Emode" swatch="#F5F2EC" />
                </View>
            </ScrollView>
        </>
    );
};

// 9. Help & Support
export const HelpPage = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (view: any) => void }) => {
    const { colors, isDark } = useTheme();
    const [showHelpForm, setShowHelpForm] = useState(false);
    const [helpSent, setHelpSent] = useState(false);
    const [helpEmail, setHelpEmail] = useState('');
    const [helpMessage, setHelpMessage] = useState('');
    const [helpSending, setHelpSending] = useState(false);

    const sendHelp = async () => {
        setHelpSending(true);
        const { error } = await submitSupportRequest({ email: helpEmail, subject: 'In-app help request', message: helpMessage });
        setHelpSending(false);
        if (error) return Alert.alert('Could Not Send Request', error);
        setHelpSent(true);
    };

    return (
        <>
            <Header title="Help & Support" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <View style={{ gap: 12, marginBottom: 24 }}>
                    <MenuLink icon="file-text" label="FAQs" onPress={() => onNavigate('faqs')} />
                    <MenuLink icon="mail" label="Contact Us" onPress={() => onNavigate('contact')} />
                    <MenuLink icon="shield" label="Privacy Policy" onPress={() => Linking.openURL(LEGAL.privacyPolicyUrl)} />
                    <MenuLink icon="file-text" label="Terms of Service" onPress={() => Linking.openURL(LEGAL.termsUrl)} />
                    {/* No "Account Deletion Help" link here.
                        It opened the Supabase function, which is not a URL to
                        put in front of anyone in a shipped app, and the gateway
                        serves it as plain text anyway. Deleting an account
                        happens in the settings drawer, which is what Guideline
                        5.1.1(v) actually asks for -- a web page was only ever a
                        convenience for somebody who cannot sign in. It comes
                        back when emode.style/app/delete-account exists. */}
                </View>

                {/* Live Chat Box */}
                <View style={{
                    backgroundColor: isDark ? 'rgba(30, 58, 138, 0.2)' : '#eff6ff',
                    borderRadius: 16,
                    padding: 20,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(30, 58, 138, 0.5)' : '#dbeafe'
                }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <Feather name="help-circle" size={20} color={isDark ? '#60a5fa' : '#1d4ed8'} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#60a5fa' : '#1d4ed8' }}>Need direct help?</Text>
                    </View>

                    {!showHelpForm && !helpSent && (
                        <Pressable
                            style={{
                                backgroundColor: isDark ? '#18181b' : '#ffffff',
                                padding: 12, borderRadius: 12, alignItems: 'center',
                                borderWidth: 1, borderColor: isDark ? 'rgba(30, 58, 138, 0.5)' : '#dbeafe',
                                boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)'
                            }}
                            onPress={() => setShowHelpForm(true)}
                        >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#60a5fa' : '#2563eb' }}>Get Help</Text>
                        </Pressable>
                    )}

                    {showHelpForm && !helpSent && (
                        <View>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, marginBottom: 8 }]}
                                placeholder="Email"
                                placeholderTextColor={colors.placeholder}
                                value={helpEmail}
                                onChangeText={setHelpEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, marginBottom: 8, height: 80 }]}
                                placeholder="How can we help?"
                                placeholderTextColor={colors.placeholder}
                                multiline
                                value={helpMessage}
                                onChangeText={setHelpMessage}
                                maxLength={5000}
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <Pressable style={[styles.button, { backgroundColor: isDark ? '#3f3f46' : '#e5e7eb', flex: 1 }]} onPress={() => setShowHelpForm(false)}>
                                    <Text style={{ color: colors.text }}>Cancel</Text>
                                </Pressable>
                                <Pressable disabled={helpSending} style={[styles.button, { backgroundColor: '#2563eb', flex: 1 }]} onPress={sendHelp}>
                                    {helpSending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff' }}>Send Request</Text>}
                                </Pressable>
                            </View>
                        </View>
                    )}

                    {helpSent && (
                        <View style={{ alignItems: 'center', padding: 12 }}>
                            <Feather name="check-circle" size={32} color="#16a34a" />
                            <Text style={{ color: isDark ? '#4ade80' : '#16a34a', fontWeight: '600', marginTop: 8 }}>Request Sent!</Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </>
    );
};

// 10. FAQs
export const FAQsPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();

    // Simple state tracking which index is open. -1 means none.
    const [openIndex, setOpenIndex] = useState<number>(-1);

    const questions = [
        { q: "How does AI generation work?", a: "Our AI analyzes your wardrobe items and creates realistic outfits based on your style preferences and the scene you describe." },
        { q: "Can I edit my profile?", a: "Yes, you can edit your profile details, avatar, and banner from the Account settings." },
        { q: "Is my data secure?", a: "Absolutely. We use industry-standard encryption to protect your personal information and wardrobe data." }
    ];

    return (
        <>
            <Header title="FAQs" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                {questions.map((item, index) => {
                    const isOpen = openIndex === index;
                    return (
                        <View key={index} style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: isDark ? '#27272a' : '#f9fafb' }}>
                            <Pressable
                                style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                                onPress={() => setOpenIndex(isOpen ? -1 : index)}
                            >
                                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 }}>{item.q}</Text>
                                <Feather name={isOpen ? "minus" : "plus"} size={20} color={colors.textSecondary} />
                            </Pressable>
                            {isOpen && (
                                <View style={{ padding: 16, backgroundColor: isDark ? '#18181b' : '#f3f4f6', borderTopWidth: 1, borderTopColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
                                    <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>{item.a}</Text>
                                </View>
                            )}
                        </View>
                    );
                })}
            </ScrollView>
        </>
    );
};

// 11. Contact Us
export const ContactPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();
    const [sent, setSent] = useState(false);
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const send = async () => {
        setSending(true);
        const result = await submitSupportRequest({ email, subject: 'Contact request', message });
        setSending(false);
        if (result.error) return Alert.alert('Could Not Send Message', result.error);
        setSent(true);
    };

    if (sent) {
        return (
            <>
                <Header title="Contact Us" onBack={onBack} />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <Feather name="check-circle" size={48} color="#16a34a" />
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 }}>Message Sent</Text>
                    <Text style={{ textAlign: 'center', color: colors.textSecondary }}>Our team will get back to you via email shortly.</Text>
                    <Pressable style={[styles.button, { backgroundColor: colors.backgroundSecondary, marginTop: 32, width: '100%' }]} onPress={onBack}>
                        <Text style={{ color: colors.text, fontWeight: '600' }}>Back to Settings</Text>
                    </Pressable>
                </View>
            </>
        );
    }

    return (
        <>
            <Header title="Contact Us" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <View style={{ gap: 16 }}>
                    <View>
                        <Text style={[styles.inputLabel, { color: isDark ? '#71717a' : '#6b7280' }]}>EMAIL ADDRESS</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: isDark ? '#27272a' : '#f9fafb', color: colors.text, borderColor: isDark ? '#3f3f46' : '#e5e7eb' }]}
                            placeholder="your@email.com"
                            placeholderTextColor={colors.placeholder}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>
                    <View>
                        <Text style={[styles.inputLabel, { color: isDark ? '#71717a' : '#6b7280' }]}>MESSAGE</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: isDark ? '#27272a' : '#f9fafb', color: colors.text, borderColor: isDark ? '#3f3f46' : '#e5e7eb', height: 120, textAlignVertical: 'top' }]}
                            placeholder="How can we help?"
                            placeholderTextColor={colors.placeholder}
                            multiline
                            numberOfLines={6}
                            value={message}
                            onChangeText={setMessage}
                            maxLength={5000}
                        />
                    </View>
                    <Pressable
                        style={[styles.button, { backgroundColor: isDark ? '#ffffff' : '#000000', marginTop: 8 }]}
                        onPress={send}
                        disabled={sending}
                    >
                        {sending ? <ActivityIndicator color={isDark ? '#000000' : '#ffffff'} /> : <Text style={{ color: isDark ? '#000000' : '#ffffff', fontWeight: '600' }}>Send Message</Text>}
                    </Pressable>
                </View>
            </ScrollView>
        </>
    );
};

// 12. Drafts Page
export interface DraftItem {
    id: string;
    type: 'board' | 'post';
    thumbnail_url: string | null;
    created_at: string;
    updated_at: string;
}

interface DraftsPageProps {
    onBack: () => void;
    onCloseDrawer?: () => void;
}

export const DraftsPage = ({ onBack, onCloseDrawer }: DraftsPageProps) => {
    const { colors, isDark } = useTheme();
    const user = useAuthStore((state) => state.user);
    const [activeTab, setActiveTab] = useState<'board' | 'post'>('board');
    const [drafts, setDrafts] = useState<DraftItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Handle selecting a draft - navigate directly to create screen
    const handleSelectDraft = (draft: DraftItem) => {
        if (onCloseDrawer) onCloseDrawer();
        router.push({ pathname: '/(tabs)/create', params: { draftId: draft.id } });
    };

    // Fetch drafts directly from Supabase
    useEffect(() => {
        const fetchDrafts = async () => {
            if (!user?.id) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('drafts')
                .select('id, type, thumbnail_url, created_at, updated_at')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false });

            if (data) {
                setDrafts(data as DraftItem[]);
            }
            if (error) {
                console.error('Error fetching drafts:', error);
            }
            setLoading(false);
        };

        fetchDrafts();
    }, [user?.id]);

    const filteredDrafts = drafts.filter(d => d.type === activeTab);

    const handleDelete = async (draft: DraftItem) => {
        Alert.alert(
            'Delete Draft',
            'Are you sure you want to delete this draft?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase
                            .from('drafts')
                            .delete()
                            .eq('id', draft.id);

                        if (!error) {
                            setDrafts(prev => prev.filter(d => d.id !== draft.id));
                        }
                    }
                },
            ]
        );
    };

    if (loading) {
        return (
            <>
                <Header title="Drafts" onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary }}>Loading...</Text>
                </View>
            </>
        );
    }

    return (
        <>
            <Header title="Drafts" onBack={onBack} />

            {/* Tabs */}
            <View style={[styles.draftsTabsRow, { borderBottomColor: colors.border }]}>
                <Pressable
                    style={[styles.draftsTab, activeTab === 'board' && [styles.draftsTabActive, { borderBottomColor: colors.text }]]}
                    onPress={() => setActiveTab('board')}
                >
                    <Feather name="layout" size={16} color={activeTab === 'board' ? colors.text : colors.textSecondary} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: activeTab === 'board' ? colors.text : colors.textSecondary }}>
                        Boards
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.draftsTab, activeTab === 'post' && [styles.draftsTabActive, { borderBottomColor: colors.text }]]}
                    onPress={() => setActiveTab('post')}
                >
                    <Feather name="image" size={16} color={activeTab === 'post' ? colors.text : colors.textSecondary} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: activeTab === 'post' ? colors.text : colors.textSecondary }}>
                        Posts
                    </Text>
                </Pressable>
            </View>

            <ScrollView style={styles.scrollContent}>
                {filteredDrafts.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                        <Feather name={activeTab === 'board' ? 'layout' : 'image'} size={48} color={colors.textTertiary} />
                        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16 }}>
                            No {activeTab === 'board' ? 'board' : 'post'} drafts
                        </Text>
                        <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
                            {activeTab === 'board' ? 'Start building a fit to save drafts' : 'Generate a fit to save post drafts'}
                        </Text>
                    </View>
                ) : (
                    <View style={{ gap: 12 }}>
                        {filteredDrafts.map((draft) => (
                            <Pressable
                                key={draft.id}
                                style={[styles.draftItem, { backgroundColor: isDark ? '#27272a' : '#f9fafb' }]}
                                onPress={() => handleSelectDraft(draft)}
                                onLongPress={() => handleDelete(draft)}
                            >
                                <View style={[styles.draftThumb, { backgroundColor: isDark ? '#18181b' : '#e5e7eb', overflow: 'hidden' }]}>
                                    {draft.thumbnail_url ? (
                                        <Image
                                            source={{ uri: draft.thumbnail_url }}
                                            style={{ width: '100%', height: '100%' }}
                                            contentFit="cover"
                                        />
                                    ) : (
                                        <Feather name={draft.type === 'board' ? 'layout' : 'image'} size={24} color={colors.textTertiary} />
                                    )}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                                        {draft.type === 'board' ? 'Board Draft' : 'Post Draft'}
                                    </Text>
                                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                        {new Date(draft.updated_at).toLocaleDateString()}
                                    </Text>
                                </View>
                                <Pressable onPress={() => handleDelete(draft)} hitSlop={12}>
                                    <Feather name="trash-2" size={18} color={colors.textTertiary} />
                                </Pressable>
                            </Pressable>
                        ))}
                    </View>
                )}
            </ScrollView>
        </>
    );
};

const styles = StyleSheet.create({
    earningsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 14,
    },
    earningsTile: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 10,
    },
    earningsLabel: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.6,
    },
    earningsValue: {
        fontSize: 17,
        fontWeight: '700',
        marginTop: 4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
        borderBottomWidth: 0.5,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
        borderRadius: 999,
    },
    scrollContent: {
        flex: 1,
        padding: 16,
    },
    sectionTitle: {
        fontSize: 12, // text-xs
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5, // tracking-wider
        marginBottom: 8,
        paddingHorizontal: 8,
    },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        paddingHorizontal: 16,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    toggleLabel: {
        fontSize: 14,
        fontWeight: '700',
    },
    toggleSubtext: {
        fontSize: 12,
        marginTop: 2,
    },
    menuLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 16,
    },
    menuLinkLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    menuLinkLabel: {
        fontSize: 15,
        fontWeight: '500',
    },
    themeContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    themeButton: {
        flexBasis: '47%',
        flexGrow: 1,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        gap: 12,
    },
    themeSwatch: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e4e4e7',
    },
    input: {
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        fontSize: 14,
    },
    button: {
        padding: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    // Drafts page styles
    draftsTabsRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
    },
    draftsTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    draftsTabActive: {
        borderBottomWidth: 2,
    },
    draftItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        gap: 12,
    },
    draftThumb: {
        width: 48,
        height: 48,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        borderTopWidth: 1,
    },
    shipOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    shipSheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 32,
        maxHeight: '88%',
    },
    shipHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    shipTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 16,
    },
});

// 12. Dressing Room
export const DressingRoomPage = ({ onBack }: { onBack: () => void }) => {
    return (
        <>
            <Header title="Dressing Room" onBack={onBack} />
            <DressingRoom />
        </>
    );
};

// 13. Shopping Cart
export const CartPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();
    const { user } = useAuthStore();
    const { cartItems, removeFromCart, isLoadingCart } = useMarketplaceStore();
    const stripeCheckout = useStripeCheckout();

    const total = cartItems.reduce((sum, item) => sum + (item.price || 0), 0);

    const [showShipping, setShowShipping] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [ship, setShip] = useState({ name: '', line1: '', line2: '', city: '', state: '', postal_code: '', country: 'US' });
    const [selectedSizes, setSelectedSizes] = useState<Record<string, string | null>>({});

    useEffect(() => {
        setSelectedSizes((current) => {
            const next: Record<string, string | null> = {};
            for (const item of cartItems) {
                const available = item.sizes || [];
                next[item.id] = current[item.id] && available.includes(current[item.id] as string)
                    ? current[item.id]
                    : (available[0] || null);
            }
            return next;
        });
    }, [cartItems]);

    const handleRemove = async (productId: string) => {
        if (!user?.id) return;
        Alert.alert(
            'Remove Item',
            'Remove this item from your cart?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => await removeFromCart(productId, user.id)
                }
            ]
        );
    };

    const handleCheckout = () => {
        if (cartItems.length === 0) return;
        setShowShipping(true);
    };

    // Group the cart by seller and run one Stripe PaymentSheet per seller
    // (each is a Connect destination charge to that seller). The order is recorded
    // server-side; the Stripe webhook marks it paid.
    const runCheckout = async () => {
        if (!user?.id) return;

        const required: (keyof typeof ship)[] = ['name', 'line1', 'city', 'state', 'postal_code', 'country'];
        if (required.some((k) => !ship[k]?.trim())) {
            Alert.alert('Missing info', 'Please complete your shipping address.');
            return;
        }

        if (!stripeCheckout.available) {
            Alert.alert('Checkout unavailable', 'Payments require the full app build (not available in Expo Go).');
            return;
        }

        const groups: Record<string, typeof cartItems> = {};
        for (const item of cartItems) {
            const sid = item.seller_id;
            if (!sid) continue;
            (groups[sid] ||= []).push(item);
        }
        const sellerIds = Object.keys(groups);
        if (sellerIds.length === 0) {
            Alert.alert('Unavailable', 'These items are no longer available.');
            return;
        }

        setProcessing(true);
        let completed = 0;
        let skipped = 0;
        try {
            for (const sid of sellerIds) {
                const groupItems = groups[sid];
                const items = groupItems.map((p) => ({ product_id: p.id, size: selectedSizes[p.id] || null }));

                let pay;
                try {
                    pay = await createOrderPayment(sid, items, { ...ship });
                } catch (e: any) {
                    if (e?.message === 'seller_not_connected') { skipped++; continue; }
                    throw e;
                }

                const { error: initError } = await stripeCheckout.initPaymentSheet({
                    paymentIntentClientSecret: pay.clientSecret,
                    customerId: pay.customerId,
                    customerEphemeralKeySecret: pay.ephemeralKey,
                    merchantDisplayName: 'Emode',
                    allowsDelayedPaymentMethods: false,
                    returnURL: 'emode://stripe-return',
                });
                if (initError) { Alert.alert('Error', initError.message); break; }

                const { error: presentError } = await stripeCheckout.presentPaymentSheet();
                if (presentError) {
                    if (presentError.code !== 'Canceled') Alert.alert('Payment Failed', presentError.message);
                    break; // stop the run on cancel/failure
                }

                // Paid — remove this seller's items from the cart.
                for (const p of groupItems) await removeFromCart(p.id, user.id);
                completed++;
            }

            if (completed > 0) {
                setShowShipping(false);
                const extra = skipped > 0 ? ` ${skipped} seller${skipped > 1 ? 's' : ''} couldn't accept payment yet and ${skipped > 1 ? 'were' : 'was'} skipped.` : '';
                Alert.alert('Order Placed 🎉', `Your ${completed > 1 ? `${completed} orders have` : 'order has'} been placed. The seller will be notified to ship your items.${extra}`);
            } else if (skipped > 0) {
                Alert.alert('Seller not ready', "This seller hasn't finished setting up payouts, so checkout isn't available for their items yet.");
            }
        } catch (e: any) {
            Alert.alert('Checkout Error', e?.message || 'Something went wrong during checkout.');
        } finally {
            setProcessing(false);
        }
    };

    if (isLoadingCart) {
        return (
            <>
                <Header title="Shopping Cart" onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary }}>Loading cart...</Text>
                </View>
            </>
        );
    }

    return (
        <>
            <Header title="Shopping Cart" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                {cartItems.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                        <Feather name="shopping-cart" size={48} color={colors.textTertiary} />
                        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16 }}>
                            Your cart is empty
                        </Text>
                        <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8 }}>
                            Start adding items to build your fit
                        </Text>
                    </View>
                ) : (
                    <View style={{ gap: 16, paddingBottom: 100 }}>
                        {cartItems.map((item) => (
                            <View
                                key={item.id}
                                style={[
                                    styles.draftItem,
                                    { backgroundColor: isDark ? '#27272a' : '#f9fafb', alignItems: 'flex-start' }
                                ]}
                            >
                                <View style={[styles.draftThumb, { width: 80, height: 80 }]}>
                                    <Image
                                        source={{ uri: item.image_urls?.[0] }}
                                        style={{ width: '100%', height: '100%' }}
                                        contentFit="cover"
                                    />
                                </View>
                                <View style={{ flex: 1, gap: 4 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }} numberOfLines={2}>
                                        {item.name}
                                    </Text>
                                    {item.sizes?.length ? (
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                                            {item.sizes.map((size) => {
                                                const selected = selectedSizes[item.id] === size;
                                                return (
                                                    <Pressable
                                                        key={size}
                                                        accessibilityRole="radio"
                                                        accessibilityState={{ selected }}
                                                        onPress={() => setSelectedSizes((current) => ({ ...current, [item.id]: size }))}
                                                        style={{
                                                            borderWidth: 1,
                                                            borderColor: selected ? colors.primary : colors.border,
                                                            backgroundColor: selected ? colors.primary : colors.background,
                                                            borderRadius: 8,
                                                            paddingHorizontal: 9,
                                                            paddingVertical: 4,
                                                        }}
                                                    >
                                                        <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? colors.primaryForeground : colors.textSecondary }}>
                                                            {size}
                                                        </Text>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    ) : (
                                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>One size</Text>
                                    )}
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary, marginTop: 4 }}>
                                        ${item.price?.toFixed(2)}
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={() => handleRemove(item.id)}
                                    hitSlop={12}
                                    style={{ padding: 4 }}
                                >
                                    <Feather name="trash-2" size={18} color={colors.textTertiary} />
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Footer Summary */}
            {cartItems.length > 0 && (
                <View style={[
                    styles.footer,
                    {
                        backgroundColor: colors.background,
                        borderTopColor: colors.border,
                        paddingVertical: 16,
                        paddingHorizontal: 20
                    }
                ]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
                        <Text style={{ fontSize: 16, color: colors.textSecondary }}>Subtotal</Text>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>${total.toFixed(2)}</Text>
                    </View>
                    <Pressable
                        style={[styles.button, { backgroundColor: colors.primary, width: '100%' }]}
                        onPress={handleCheckout}
                    >
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Checkout</Text>
                    </Pressable>
                </View>
            )}

            {/* Shipping address → per-seller Stripe PaymentSheet */}
            <Modal
                visible={showShipping}
                transparent
                animationType="slide"
                onRequestClose={() => { if (!processing) setShowShipping(false); }}
            >
                <View style={styles.shipOverlay}>
                    <View style={[styles.shipSheet, { backgroundColor: colors.background }]}>
                        <View style={[styles.shipHandle, { backgroundColor: isDark ? '#3f3f46' : '#e5e7eb' }]} />
                        <Text style={[styles.shipTitle, { color: colors.text }]}>Shipping Address</Text>
                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
                            {([
                                { key: 'name', ph: 'Full name', cap: 'words' },
                                { key: 'line1', ph: 'Address', cap: 'words' },
                                { key: 'line2', ph: 'Apt, suite (optional)', cap: 'words' },
                                { key: 'city', ph: 'City', cap: 'words' },
                                { key: 'state', ph: 'State / Province', cap: 'characters' },
                                { key: 'postal_code', ph: 'ZIP / Postal code', cap: 'characters' },
                                { key: 'country', ph: 'Country (e.g. US)', cap: 'characters' },
                            ] as const).map((f) => (
                                <TextInput
                                    key={f.key}
                                    style={[styles.input, { backgroundColor: isDark ? '#27272a' : '#f9fafb', color: colors.text, borderColor: isDark ? '#3f3f46' : '#e5e7eb', marginBottom: 10 }]}
                                    placeholder={f.ph}
                                    placeholderTextColor={colors.placeholder}
                                    value={(ship as any)[f.key]}
                                    onChangeText={(t) => setShip((s) => ({ ...s, [f.key]: t }))}
                                    autoCapitalize={f.cap as any}
                                    editable={!processing}
                                />
                            ))}
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
                                Total ${total.toFixed(2)} • You'll confirm payment on the next step. Items from different sellers are charged separately.
                            </Text>
                            <Pressable
                                style={[styles.button, { backgroundColor: colors.primary, opacity: processing ? 0.6 : 1 }]}
                                onPress={runCheckout}
                                disabled={processing}
                            >
                                {processing
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Continue to Payment</Text>}
                            </Pressable>
                            <Pressable style={{ alignItems: 'center', padding: 12 }} onPress={() => { if (!processing) setShowShipping(false); }}>
                                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                            </Pressable>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
};

// 14. My Orders (buyer order history)
interface OrderRow {
    id: string;
    status: string;
    subtotal_amount: number;
    created_at: string;
    shipping: any;
    seller?: { id: string; username?: string; handle?: string; avatar_url?: string } | null;
    items: { id: string; name: string; price_amount: number; size?: string | null; image_url?: string | null }[];
}

const ORDER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'Pending', color: '#b45309', bg: 'rgba(245,158,11,0.15)' },
    paid: { label: 'Paid', color: '#15803d', bg: 'rgba(34,197,94,0.15)' },
    fulfilled: { label: 'Shipped', color: '#1d4ed8', bg: 'rgba(37,99,235,0.15)' },
    failed: { label: 'Failed', color: '#b91c1c', bg: 'rgba(239,68,68,0.15)' },
    cancelled: { label: 'Cancelled', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
};

export const OrdersPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();
    const { user } = useAuthStore();
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            if (!user?.id) { setLoading(false); return; }
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    id, status, subtotal_amount, created_at, shipping,
                    seller:users!orders_seller_id_fkey(id, username, handle, avatar_url),
                    items:order_items(id, name, price_amount, size, image_url)
                `)
                .eq('buyer_id', user.id)
                .order('created_at', { ascending: false });
            if (!error && data) setOrders(data as any);
            if (error) console.error('Error loading orders:', error.message);
            setLoading(false);
        })();
    }, [user?.id]);

    const fmtDate = (ts: string) =>
        new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    if (loading) {
        return (
            <>
                <Header title="My Orders" onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={colors.text} />
                </View>
            </>
        );
    }

    if (orders.length === 0) {
        return (
            <>
                <Header title="My Orders" onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                    <Feather name="package" size={48} color={colors.textTertiary} />
                    <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16 }}>No orders yet</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
                        Items you buy from the marketplace will show up here.
                    </Text>
                </View>
            </>
        );
    }

    return (
        <>
            <Header title="My Orders" onBack={onBack} />
            <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 40 }}>
                {orders.map((order) => {
                    const st = ORDER_STATUS[order.status] || ORDER_STATUS.pending;
                    return (
                        <View
                            key={order.id}
                            style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', padding: 14, marginBottom: 14 }]}
                        >
                            {/* Seller + status */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                    {order.seller?.avatar_url
                                        ? <Image source={{ uri: order.seller.avatar_url }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                                        : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? '#27272a' : '#f3f4f6' }} />}
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                                        {order.seller?.handle || order.seller?.username || 'Seller'}
                                    </Text>
                                </View>
                                <View style={{ backgroundColor: st.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: st.color }}>{st.label}</Text>
                                </View>
                            </View>

                            {/* Items */}
                            <View style={{ gap: 10 }}>
                                {order.items?.map((it) => (
                                    <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <View style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: isDark ? '#27272a' : '#f3f4f6' }}>
                                            {it.image_url ? <Image source={{ uri: it.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }} numberOfLines={1}>{it.name}</Text>
                                            {it.size ? <Text style={{ fontSize: 12, color: colors.textSecondary }}>Size {it.size}</Text> : null}
                                        </View>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>${(it.price_amount / 100).toFixed(2)}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Date + total */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#27272a' : '#f3f4f6' }}>
                                <Text style={{ fontSize: 12, color: colors.textTertiary }}>{fmtDate(order.created_at)}</Text>
                                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>${(order.subtotal_amount / 100).toFixed(2)}</Text>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        </>
    );
};

// 15. Sales (incoming orders for sellers)
interface SaleRow {
    id: string;
    status: string;
    subtotal_amount: number;
    platform_fee_amount: number;
    created_at: string;
    shipping: { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
    buyer?: { id: string; username?: string; handle?: string; avatar_url?: string } | null;
    items: { id: string; name: string; price_amount: number; size?: string | null; image_url?: string | null }[];
}

export const SalesPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();
    const { user } = useAuthStore();
    const [sales, setSales] = useState<SaleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [showPayoutSetup, setShowPayoutSetup] = useState(false);
    const [payoutReady, setPayoutReady] = useState<boolean | null>(null);
    const [sessions, setSessions] = useState<any[]>([]);

    // What this page is called depends on what the account is. "Sales" is right
    // for a shop and wrong for a stylist, who has bookings rather than orders,
    // and somebody who is both needs a word that covers the two.
    const sellsGoods = !!user?.is_business_account;
    const sellsStyling = !!user?.is_verified_stylist;
    const pageTitle = sellsGoods && sellsStyling ? 'Earnings' : sellsStyling ? 'Sessions' : 'Sales';

    // The filter only appears when there is something to filter. One role means
    // one list, and a segmented control over a single option is furniture.
    const [tab, setTab] = useState<'orders' | 'sessions'>(sellsGoods ? 'orders' : 'sessions');
    const showBothLists = sellsGoods && sellsStyling;

    useEffect(() => {
        (async () => {
            if (!user?.id) { setLoading(false); return; }
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    id, status, subtotal_amount, platform_fee_amount, created_at, shipping,
                    buyer:users!orders_buyer_id_fkey(id, username, handle, avatar_url),
                    items:order_items(id, name, price_amount, size, image_url)
                `)
                .eq('seller_id', user.id)
                .in('status', ['paid', 'fulfilled'])
                .order('created_at', { ascending: false });
            if (!error && data) setSales(data as any);
            if (error) console.error('Error loading sales:', error.message);
            setLoading(false);
        })();
    }, [user?.id]);

    // Styling sessions belong here too. They were the one kind of income the
    // app could earn that this page never mentioned.
    const [portfolioBySession, setPortfolioBySession] = useState<Record<string, string>>({});

    const refreshPortfolio = async (stylistId: string) => {
        const items = await getOwnPortfolio(stylistId);
        const bySession: Record<string, string> = {};
        for (const item of items) {
            if (item.session_id) bySession[item.session_id] = item.status;
        }
        setPortfolioBySession(bySession);
    };

    useEffect(() => {
        if (!user?.id || !sellsStyling) return;
        refreshPortfolio(user.id);
    }, [user?.id, sellsStyling]);

    const askForPortfolio = async (session: any) => {
        if (!user?.id) return;
        try {
            // The delivery message holds the private-media paths for this
            // look. Reading them straight off the message means the approval
            // copies the real pictures rather than nothing -- the row is stored
            // with paths, never with the signed URLs the chat renders, since
            // those expire within the hour.
            let generatedPath: string | null = null;
            let boardPath: string | null = null;

            if (session.delivery_message_id) {
                const { data: message } = await supabase
                    .from('messages')
                    .select('styling_delivery')
                    .eq('id', session.delivery_message_id)
                    .maybeSingle();
                const delivery = (message as any)?.styling_delivery;
                generatedPath = delivery?.generated_image_url ?? null;
                boardPath = delivery?.board_image_url ?? null;
            }

            if (!generatedPath && !boardPath) {
                Alert.alert('Portfolio', 'That session has no delivered look to show yet.');
                return;
            }

            await requestPortfolioItem({
                sessionId: session.id,
                clientId: session.client_id,
                generatedPath,
                boardPath,
                title: session.description ?? null,
            });
            await refreshPortfolio(user.id);
            Alert.alert(
                'Request sent',
                `${session.client?.handle || 'Your client'} decides whether this look appears in your portfolio. Nobody else can see it until they say yes.`,
            );
        } catch (error: any) {
            Alert.alert('Portfolio', error?.message || 'Could not send that request.');
        }
    };

    useEffect(() => {
        if (!user?.id || !sellsStyling) return;
        (async () => {
            const { data, error } = await supabase
                .from('styling_sessions')
                .select('*, client:users!styling_sessions_client_id_fkey(id, handle, username, avatar_url)')
                .eq('stylist_id', user.id)
                .order('created_at', { ascending: false });
            if (error) { console.error('Error loading sessions:', error.message); return; }
            setSessions(data ?? []);
        })();
    }, [user?.id, sellsStyling]);

    useEffect(() => {
        if (!user?.id) return;
        checkConnectStatus(user.id)
            .then((status) => setPayoutReady(status.onboardingComplete))
            .catch(() => setPayoutReady(false));
    }, [user?.id, showPayoutSetup]);

    // What any of this adds up to.
    //
    // The page listed every order and session with its own figure and never
    // totalled them, so somebody earning through the app had no way to see what
    // they had made without adding it up by hand. Derived from what is already
    // loaded rather than fetched again.
    //
    // Earned counts money that is actually theirs: an order that has been paid,
    // and a session that has been delivered. A booked session is authorised,
    // not captured, so it sits under pending until the look is sent.
    const earnings = useMemo(() => {
        const orderPayout = (order: SaleRow) =>
            (order.subtotal_amount - order.platform_fee_amount) / 100;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        let earned = 0;
        let pending = 0;
        let thisMonth = 0;

        for (const order of sales) {
            const amount = orderPayout(order);
            earned += amount;
            if (new Date(order.created_at) >= startOfMonth) thisMonth += amount;
        }

        for (const session of sessions) {
            const amount = Number(session.stylist_amount ?? 0);
            const settled = session.status === 'delivered' || session.status === 'completed';
            const dead = session.status === 'cancelled' || session.status === 'expired';

            if (settled) {
                earned += amount;
                if (new Date(session.created_at) >= startOfMonth) thisMonth += amount;
            } else if (!dead) {
                pending += amount;
            }
        }

        return { earned, pending, thisMonth };
    }, [sales, sessions]);

    const openPayoutDashboard = async () => {
        try {
            const { url } = await getConnectLoginUrl();
            await Linking.openURL(url);
        } catch (error: any) {
            Alert.alert('Payout Account', error?.message || 'Could not open your payout account.');
        }
    };

    const markShipped = (order: SaleRow) => {
        Alert.alert('Mark as Shipped', "Confirm you've shipped this order to the buyer?", [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Mark Shipped',
                onPress: async () => {
                    setUpdatingId(order.id);
                    const { error } = await supabase.from('orders').update({ status: 'fulfilled' }).eq('id', order.id);
                    setUpdatingId(null);
                    if (error) { Alert.alert('Error', error.message); return; }
                    setSales((prev) => prev.map((s) => (s.id === order.id ? { ...s, status: 'fulfilled' } : s)));
                },
            },
        ]);
    };

    const fmtDate = (ts: string) =>
        new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtAddress = (s: SaleRow['shipping']) => {
        if (!s) return '';
        return [s.name, s.line1, s.line2, [s.city, s.state].filter(Boolean).join(', '), s.postal_code, s.country]
            .filter(Boolean).join('\n');
    };

    if (loading) {
        return (
            <>
                <Header title={pageTitle} onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={colors.text} />
                </View>
            </>
        );
    }

    // A stylist with no shop orders used to hit "No sales yet" and never reach
    // their own bookings, which were sitting right there unrendered.
    if (sales.length === 0 && sessions.length === 0) {
        return (
            <>
                <Header title={pageTitle} onBack={onBack} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                    <Feather name="shopping-bag" size={48} color={colors.textTertiary} />
                    <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16 }}>{sellsStyling && !sellsGoods ? 'No sessions yet' : 'No sales yet'}</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
                        {sellsStyling && !sellsGoods
                            ? 'When a client books you, the session shows up here.'
                            : 'When someone buys your items, their orders show up here to fulfill.'}
                    </Text>
                    {/* Until the check comes back, payoutReady is null and
                        saying "Set Up Seller Payouts" is a guess -- the wrong
                        one for anybody already set up, which is why the label
                        flickered and changed under the thumb. Wait instead.

                        And a ready account opens the Stripe dashboard rather
                        than the setup flow: the label changed here but the
                        handler never did, so "Review" reopened onboarding
                        somebody had just finished. */}
                    <Pressable
                        style={[styles.button, {
                            backgroundColor: payoutReady === null ? colors.backgroundSecondary : colors.primary,
                            marginTop: 20,
                            paddingHorizontal: 18,
                        }]}
                        disabled={payoutReady === null}
                        onPress={payoutReady ? openPayoutDashboard : () => setShowPayoutSetup(true)}
                    >
                        <Text style={{
                            color: payoutReady === null ? colors.textSecondary : colors.primaryForeground,
                            fontWeight: '700',
                        }}>
                            {payoutReady === null
                                ? 'Checking payout account…'
                                : payoutReady ? 'Review Payout Account' : 'Set Up Seller Payouts'}
                        </Text>
                    </Pressable>
                </View>
                <StripeConnectOnboarding visible={showPayoutSetup} onClose={() => setShowPayoutSetup(false)} onComplete={() => setShowPayoutSetup(false)} />
            </>
        );
    }

    return (
        <>
            <Header title={pageTitle} onBack={onBack} />
            <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={styles.earningsRow}>
                    <View style={[styles.earningsTile, { backgroundColor: colors.backgroundSecondary }]}>
                        <Text style={[styles.earningsLabel, { color: colors.textSecondary }]}>EARNED</Text>
                        <Text style={[styles.earningsValue, { color: '#15803d' }]}>${earnings.earned.toFixed(2)}</Text>
                    </View>
                    <View style={[styles.earningsTile, { backgroundColor: colors.backgroundSecondary }]}>
                        <Text style={[styles.earningsLabel, { color: colors.textSecondary }]}>THIS MONTH</Text>
                        <Text style={[styles.earningsValue, { color: colors.text }]}>${earnings.thisMonth.toFixed(2)}</Text>
                    </View>
                    {sellsStyling && (
                        <View style={[styles.earningsTile, { backgroundColor: colors.backgroundSecondary }]}>
                            <Text style={[styles.earningsLabel, { color: colors.textSecondary }]}>PENDING</Text>
                            <Text style={[styles.earningsValue, { color: colors.textSecondary }]}>${earnings.pending.toFixed(2)}</Text>
                        </View>
                    )}
                </View>

                <Pressable
                    style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                    // Once setup is done this opens the Stripe dashboard, where
                    // balances and payout dates live. It used to reopen the
                    // onboarding flow -- the same fault the button below the
                    // empty state had: the wording changed with payoutReady and
                    // the handler never did.
                    onPress={payoutReady ? openPayoutDashboard : () => setShowPayoutSetup(true)}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>Seller payouts</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {payoutReady
                                ? 'Setup complete — view balance and payouts on Stripe'
                                : 'Complete Stripe setup before buyers can check out'}
                        </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.textTertiary} />
                </Pressable>
                {/* Only when both kinds of income exist. Somebody who just
                    sells clothes, or just styles, has one list and needs no
                    control over it. */}
                {showBothLists && (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                        {(['orders', 'sessions'] as const).map((option) => (
                            <Pressable
                                key={option}
                                onPress={() => setTab(option)}
                                style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    borderRadius: 10,
                                    alignItems: 'center',
                                    backgroundColor: tab === option ? colors.primary : colors.backgroundSecondary,
                                }}
                            >
                                <Text style={{
                                    fontWeight: '700',
                                    fontSize: 13,
                                    color: tab === option ? colors.primaryForeground : colors.textSecondary,
                                }}>
                                    {option === 'orders' ? `Orders (${sales.length})` : `Sessions (${sessions.length})`}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                {(!showBothLists || tab === 'sessions') && sellsStyling && sessions.map((session) => {
                    const paid = session.status === 'delivered' || session.status === 'completed';
                    const live = session.status === 'active';
                    const dead = session.status === 'cancelled' || session.status === 'expired';
                    const badge = dead
                        ? { label: 'Cancelled', color: '#b91c1c', bg: 'rgba(185,28,28,0.12)' }
                        : live
                            ? { label: 'Live', color: '#4f46e5', bg: 'rgba(99,102,241,0.12)' }
                            : paid
                                ? { label: 'Delivered', color: '#15803d', bg: 'rgba(21,128,61,0.12)' }
                                : { label: 'Booked', color: '#b45309', bg: 'rgba(180,83,9,0.12)' };

                    // stylist_amount is what actually lands after the platform
                    // takes its cut; amount is what the client paid. Showing the
                    // client's figure as earnings would overstate every line.
                    const earned = Number(session.stylist_amount ?? 0);

                    return (
                        <View
                            key={session.id}
                            style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', padding: 14, marginBottom: 14 }]}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                    {session.client?.avatar_url
                                        ? <Image source={{ uri: session.client.avatar_url }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                                        : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? '#27272a' : '#f3f4f6' }} />}
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                                        {session.client?.handle || session.client?.username || 'Client'}
                                    </Text>
                                </View>
                                <View style={{ backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: badge.color }}>{badge.label}</Text>
                                </View>
                            </View>

                            {session.description ? (
                                <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={2}>{session.description}</Text>
                            ) : null}

                            {/* Only a delivered look can be shown, and only if
                                the client agrees. The button asks; it does not
                                publish. */}
                            {paid && (
                                portfolioBySession[session.id] === 'approved' ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                                        <Feather name="check-circle" size={13} color="#15803d" />
                                        <Text style={{ fontSize: 12, color: '#15803d', fontWeight: '600' }}>In your portfolio</Text>
                                    </View>
                                ) : portfolioBySession[session.id] === 'pending' ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                                        <Feather name="clock" size={13} color={colors.textTertiary} />
                                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>Waiting on your client</Text>
                                    </View>
                                ) : (
                                    <Pressable
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}
                                        onPress={() => askForPortfolio(session)}
                                    >
                                        <Feather name="plus-circle" size={13} color={colors.primary} />
                                        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Ask to show in portfolio</Text>
                                    </Pressable>
                                )
                            )}

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#27272a' : '#f3f4f6' }}>
                                <View>
                                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                                        {fmtDate(session.created_at)}{session.duration_minutes ? ` · ${session.duration_minutes} min` : ''}
                                    </Text>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: paid ? '#15803d' : colors.textSecondary, marginTop: 2 }}>
                                        {paid ? `You earned $${earned.toFixed(2)}` : `$${earned.toFixed(2)} pending`}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    );
                })}

                {(!showBothLists || tab === 'orders') && sales.map((order) => {
                    const st = ORDER_STATUS[order.status] || ORDER_STATUS.paid;
                    const payout = (order.subtotal_amount - order.platform_fee_amount) / 100;
                    return (
                        <View
                            key={order.id}
                            style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', padding: 14, marginBottom: 14 }]}
                        >
                            {/* Buyer + status */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                    {order.buyer?.avatar_url
                                        ? <Image source={{ uri: order.buyer.avatar_url }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                                        : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? '#27272a' : '#f3f4f6' }} />}
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                                        {order.buyer?.handle || order.buyer?.username || 'Buyer'}
                                    </Text>
                                </View>
                                <View style={{ backgroundColor: st.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: st.color }}>{st.label}</Text>
                                </View>
                            </View>

                            {/* Items */}
                            <View style={{ gap: 10 }}>
                                {order.items?.map((it) => (
                                    <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <View style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: isDark ? '#27272a' : '#f3f4f6' }}>
                                            {it.image_url ? <Image source={{ uri: it.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }} numberOfLines={1}>{it.name}</Text>
                                            {it.size ? <Text style={{ fontSize: 12, color: colors.textSecondary }}>Size {it.size}</Text> : null}
                                        </View>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>${(it.price_amount / 100).toFixed(2)}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Shipping address (seller needs this to fulfill) */}
                            {order.shipping ? (
                                <View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: isDark ? '#27272a' : '#f9fafb' }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 4, textTransform: 'uppercase' }}>Ship to</Text>
                                    <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>{fmtAddress(order.shipping)}</Text>
                                </View>
                            ) : null}

                            {/* Payout + date + action */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#27272a' : '#f3f4f6' }}>
                                <View>
                                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>{fmtDate(order.created_at)}</Text>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803d', marginTop: 2 }}>You earn ${payout.toFixed(2)}</Text>
                                </View>
                                {order.status === 'paid' ? (
                                    <Pressable
                                        style={[styles.button, { backgroundColor: colors.primary, paddingHorizontal: 16 }]}
                                        onPress={() => markShipped(order)}
                                        disabled={updatingId === order.id}
                                    >
                                        {updatingId === order.id
                                            ? <ActivityIndicator color="#fff" size="small" />
                                            : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Mark Shipped</Text>}
                                    </Pressable>
                                ) : (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Feather name="check-circle" size={16} color="#15803d" />
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#15803d' }}>Shipped</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
            <StripeConnectOnboarding visible={showPayoutSetup} onClose={() => setShowPayoutSetup(false)} onComplete={() => setShowPayoutSetup(false)} />
        </>
    );
};
