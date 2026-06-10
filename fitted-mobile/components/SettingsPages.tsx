import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, TextInput, Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import DressingRoom from '@/components/DressingRoom';
import { useMarketplaceStore } from '@/stores/marketplaceStore';

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
    const { user, updateProfile } = useAuthStore();
    const [isPrivate, setIsPrivate] = useState(false);
    const [showActivity, setShowActivity] = useState(user?.show_activity_status ?? true);

    const handleActivityChange = (value: boolean) => {
        setShowActivity(value);
        updateProfile({ show_activity_status: value });
    };

    return (
        <>
            <Header title="Privacy & Security" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                {/* Account Privacy Group */}
                <SectionTitle title="Account Privacy" />
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6' }]}>
                    <ToggleRow
                        label="Private Account"
                        subtext="Only approved followers can see your fits"
                        value={isPrivate}
                        onValueChange={setIsPrivate}
                    />
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
                    <MenuLink icon="shield" label="Two-Factor Authentication" onPress={() => onNavigate('2fa')} />
                    <MenuLink icon="monitor" label="Login Activity" onPress={() => onNavigate('loginActivity')} />
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
            Alert.alert('Remove Session', `Remove login record for ${session.device_name}?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove', style: 'destructive',
                    onPress: async () => {
                        await supabase.from('login_sessions').delete().eq('id', session.id);
                        setSessions(prev => prev.filter(s => s.id !== session.id));
                    },
                },
            ]);
        }
    };

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
                            <TouchableOpacity onPress={() => handleRemoveSession(session)} hitSlop={12}>
                                <Text style={{
                                    fontSize: 13,
                                    color: isCurrent ? '#ef4444' : colors.textSecondary,
                                    fontWeight: '600',
                                }}>
                                    {isCurrent ? 'Log Out' : 'Remove'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    );
                })}
            </ScrollView>
        </>
    );
};

// 7. Notifications
export const NotificationsPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();
    const [pauseAll, setPauseAll] = useState(false);
    const [likes, setLikes] = useState(true);
    const [comments, setComments] = useState(true);
    const [newFollowers, setNewFollowers] = useState(true);
    const [stylistUpdates, setStylistUpdates] = useState(true);
    const [trendAlerts, setTrendAlerts] = useState(false);
    const [appUpdates, setAppUpdates] = useState(true);

    return (
        <>
            <Header title="Notifications" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', marginBottom: 24 }]}>
                    <ToggleRow label="Pause All" value={pauseAll} onValueChange={setPauseAll} />
                </View>

                <SectionTitle title="Interactions" />
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6', marginBottom: 24 }]}>
                    <ToggleRow label="Likes" value={likes} onValueChange={setLikes} />
                    <ToggleRow label="Comments" value={comments} onValueChange={setComments} />
                    <ToggleRow label="New Followers" value={newFollowers} onValueChange={setNewFollowers} />
                </View>

                <SectionTitle title="App" />
                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6' }]}>
                    <ToggleRow label="Stylist Updates" value={stylistUpdates} onValueChange={setStylistUpdates} />
                    <ToggleRow label="Trend Alerts" value={trendAlerts} onValueChange={setTrendAlerts} />
                    <ToggleRow label="App Updates" value={appUpdates} onValueChange={setAppUpdates} />
                </View>
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

    return (
        <>
            <Header title="Help & Support" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <View style={{ gap: 12, marginBottom: 24 }}>
                    <MenuLink icon="file-text" label="FAQs" onPress={() => onNavigate('faqs')} />
                    <MenuLink icon="mail" label="Contact Us" onPress={() => onNavigate('contact')} />
                    <MenuLink icon="shield" label="Privacy Policy" onPress={() => { }} />
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

                    <Pressable style={{
                        backgroundColor: isDark ? 'rgba(30, 58, 138, 0.5)' : '#bfdbfe',
                        padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 12
                    }} disabled>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Feather name="lock" size={14} color={isDark ? '#3b82f6' : '#60a5fa'} />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#3b82f6' : '#60a5fa' }}>Start Live Chat (Locked)</Text>
                        </View>
                    </Pressable>

                    {!showHelpForm && !helpSent && (
                        <Pressable
                            style={{
                                backgroundColor: isDark ? '#18181b' : '#ffffff',
                                padding: 12, borderRadius: 12, alignItems: 'center',
                                borderWidth: 1, borderColor: isDark ? 'rgba(30, 58, 138, 0.5)' : '#dbeafe',
                                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }
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
                            />
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, marginBottom: 8, height: 80 }]}
                                placeholder="How can we help?"
                                placeholderTextColor={colors.placeholder}
                                multiline
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <Pressable style={[styles.button, { backgroundColor: isDark ? '#3f3f46' : '#e5e7eb', flex: 1 }]} onPress={() => setShowHelpForm(false)}>
                                    <Text style={{ color: colors.text }}>Cancel</Text>
                                </Pressable>
                                <Pressable style={[styles.button, { backgroundColor: '#2563eb', flex: 1 }]} onPress={() => setHelpSent(true)}>
                                    <Text style={{ color: '#fff' }}>Send Request</Text>
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
                        />
                    </View>
                    <Pressable
                        style={[styles.button, { backgroundColor: isDark ? '#ffffff' : '#000000', marginTop: 8 }]}
                        onPress={() => setSent(true)}
                    >
                        <Text style={{ color: isDark ? '#000000' : '#ffffff', fontWeight: '600' }}>Send Message</Text>
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

    const total = cartItems.reduce((sum, item) => sum + (item.price || 0), 0);

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
        Alert.alert('Checkout', ` Proceed to checkout? Total: $${total.toFixed(2)}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Pay Now', onPress: () => Alert.alert('Success', 'Order placed successfully!') }
        ]);
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
                                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                        Size: {(item.sizes && item.sizes.length > 0) ? item.sizes[0] : 'N/A'}
                                    </Text>
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
                        <Text style={{ fontSize: 16, color: colors.textSecondary }}>Total</Text>
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
        </>
    );
};
