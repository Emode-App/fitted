import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, TextInput, Pressable, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';

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
    const [smsEnabled, setSmsEnabled] = useState(false);
    const [authAppEnabled, setAuthAppEnabled] = useState(false);

    return (
        <>
            <Header title="Two-Factor Auth" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <View style={{ alignItems: 'center', marginVertical: 32 }}>
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: isDark ? '#1e3a8a' : '#dbeafe', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                        <Feather name="shield" size={40} color="#2563eb" />
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Add extra security</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
                        Protect your account with an additional layer of security.
                    </Text>
                </View>

                <View style={[styles.card, { backgroundColor: colors.background, borderColor: isDark ? '#27272a' : '#f3f4f6' }]}>
                    <ToggleRow
                        label="Text Message"
                        subtext="...8832"
                        value={smsEnabled}
                        onValueChange={setSmsEnabled}
                    />
                    <ToggleRow
                        label="Authenticator App"
                        subtext="Recommended"
                        value={authAppEnabled}
                        onValueChange={setAuthAppEnabled}
                    />
                </View>
            </ScrollView>
        </>
    );
};

// 6. Login Activity
export const LoginActivityPage = ({ onBack }: { onBack: () => void }) => {
    const { colors, isDark } = useTheme();

    const SessionItem = ({ name, time, isActive, isPhone }: { name: string, time: string, isActive?: boolean, isPhone?: boolean }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#27272a' : '#f3f4f6' }}>
            <Feather name={isPhone ? "smartphone" : "monitor"} size={24} color={colors.textSecondary} style={{ marginRight: 16 }} />
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{name}</Text>
                <Text style={{ fontSize: 13, color: isActive ? '#10b981' : colors.textSecondary, fontWeight: isActive ? '700' : '400' }}>
                    {isActive ? 'Active now' : time}
                </Text>
            </View>
            {!isActive && (
                <TouchableOpacity>
                    <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600' }}>Log Out</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <>
            <Header title="Login Activity" onBack={onBack} />
            <ScrollView style={styles.scrollContent}>
                <SessionItem name="iPhone 15 Pro" time="Active now" isActive isPhone />
                <SessionItem name="MacBook Air" time="2 hours ago" />
                <SessionItem name="Chrome on Windows" time="Yesterday" />
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

    const ThemeButton = ({ id, label, icon }: { id: string; label: string; icon: string }) => {
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
                <Feather name={icon as any} size={24} color={isSelected ? colors.text : colors.textSecondary} />
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
        gap: 16,
    },
    themeButton: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        gap: 12,
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
    }
});
