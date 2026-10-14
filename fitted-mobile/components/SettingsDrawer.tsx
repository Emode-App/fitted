// Settings Drawer - Slide-in modal from profile with settings menu
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Pressable,
    Alert,
    Animated,
    Dimensions,
    Easing,
    Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { supabase } from '@/services/supabase';
import {
    PrivacyPage,
    NotificationsPage,
    AppearancePage,
    HelpPage,
    LoginActivityPage,
    FAQsPage,
    ContactPage,
    DraftsPage,
    DressingRoomPage,
    CartPage,
    OrdersPage,
    SalesPage,
    DraftItem,
} from './SettingsPages';


// View Types
type SettingsView =
    | 'menu'
    | 'appearance'
    | 'notifications'
    | 'privacy'
    | 'help'
    | 'loginActivity'
    | 'faqs'
    | 'contact'
    | 'drafts'
    | 'dressingRoom'
    | 'cart'
    | 'orders'
    | 'sales';

interface SettingsDrawerProps {
    visible: boolean;
    onClose: () => void;
    initialView?: SettingsView;
    /** Ask the parent to present a paywall, since this drawer unmounts itself. */
    onRequestPaywall?: (which: 'business' | 'pro') => void;
}

const { width } = Dimensions.get('window');
const DRAWER_WIDTH_PCT = 0.85;
const DRAWER_MAX_WIDTH = 400;

export default function SettingsDrawer({ visible, onClose, initialView = 'menu', onRequestPaywall }: SettingsDrawerProps) {
    const [currentView, setCurrentView] = useState<SettingsView>(initialView);
    const { colors, isDark } = useTheme();
    const signOut = useAuthStore((state) => state.signOut);
    const deleteAccount = useAuthStore((state) => state.deleteAccount);
    const user = useAuthStore((state) => state.user);
    const updateProfile = useAuthStore((state) => state.updateProfile);
    const setUser = useAuthStore((state) => state.setUser);
    const { dressingRoomBadgeCount, cartItems } = useMarketplaceStore();
    /**
     * Ask whoever owns this drawer to show a paywall.
     *
     * Not rendered here, and not merely because iOS refuses to present a modal
     * on top of another -- this component returns null the moment it is hidden,
     * so anything it owns disappears with it. A paywall opened by closing the
     * drawer has to outlive the drawer, which means the parent renders it.
     */
    const requestPaywall = (which: 'business' | 'pro') => {
        onRequestPaywall?.(which);
    };

    // Animation states
    const [internalVisible, setInternalVisible] = useState(false);
    // Start off-screen to the left
    const slideAnim = useRef(new Animated.Value(-width)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            setInternalVisible(true);
            // Use initialView when opening, or menu if not specified
            setCurrentView(initialView);

            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    easing: Easing.out(Easing.poly(4)),
                    useNativeDriver: Platform.OS !== 'web',
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: Platform.OS !== 'web',
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: -width,
                    duration: 250,
                    easing: Easing.in(Easing.poly(4)),
                    useNativeDriver: Platform.OS !== 'web',
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: Platform.OS !== 'web',
                }),
            ]).start(({ finished }) => {
                if (finished) {
                    setInternalVisible(false);
                }
            });
        }
    }, [visible]);

    const handleLogout = async () => {
        Alert.alert(
            'Log Out',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: async () => {
                        await signOut();
                        onClose();
                        router.replace('/auth');
                    },
                },
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete Account',
            'This permanently deletes your account, posts, messages, wardrobe, and all associated data. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        // Second confirmation — deletion is irreversible.
                        Alert.alert(
                            'Are you absolutely sure?',
                            'Your account and everything in it will be permanently removed.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Delete Forever',
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            await deleteAccount();
                                            onClose();
                                            router.replace('/auth');
                                        } catch (e: any) {
                                            Alert.alert('Error', e?.message || 'Could not delete your account. Please try again.');
                                        }
                                    },
                                },
                            ]
                        );
                    },
                },
            ]
        );
    };

    const renderMenu = () => (
        <>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
                <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: isDark ? '#27272a' : '#f3f4f6' }]}>
                    <Feather name="x" size={20} color={colors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollContent}>
                {/* Account Section */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: isDark ? '#71717a' : '#9ca3af' }]}>Account</Text>
                    <View style={{ gap: 4 }}>
                        <MenuItem
                            icon="shopping-bag"
                            label="Dressing Room"
                            onPress={() => setCurrentView('dressingRoom')}
                            colors={colors}
                            isDark={isDark}
                            badge={dressingRoomBadgeCount}
                        />
                        <MenuItem // Cart
                            icon="shopping-cart"
                            label="Shopping Cart"
                            onPress={() => setCurrentView('cart')}
                            colors={colors}
                            isDark={isDark}
                            badge={cartItems.length}
                        />
                        <MenuItem
                            icon="package"
                            label="My Orders"
                            onPress={() => setCurrentView('orders')}
                            colors={colors}
                            isDark={isDark}
                        />
                        {/* The way in from the app to the physical mirror. A pushed
                            route rather than a sheet, so it is closed first: the
                            drawer is itself a modal and returns null once hidden. */}
                        <MenuItem
                            icon="monitor"
                            label="Emode Mirror"
                            onPress={() => {
                                onClose();
                                // Cast until expo-router regenerates its typed routes
                                // on the next `expo start`; the route exists.
                                setTimeout(() => router.push('/mirror' as any), 250);
                            }}
                            colors={colors}
                            isDark={isDark}
                        />
                        {/* The only way to this paywall used to be running out
                            of try-ons -- fifteen in a day, then a sheet nobody
                            had gone looking for. A subscription you cannot find
                            is one nobody buys, and one a reviewer cannot test
                            either. Hidden once bought, since there is nothing
                            left to sell. */}
                        {!user?.has_pro_tryons && (
                            <MenuItem
                                icon="zap"
                                label="Pro Try-Ons"
                                onPress={() => requestPaywall('pro')}
                                colors={colors}
                                isDark={isDark}
                            />
                        )}
                        {(user?.is_business_account || user?.is_verified_stylist) && (
                            <MenuItem
                                icon="trending-up"
                                // "Sales" reads wrong to a stylist, who takes
                                // bookings rather than orders. Someone who does
                                // both needs a word that covers the two.
                                label={
                                    user?.is_business_account && user?.is_verified_stylist
                                        ? 'Earnings'
                                        : user?.is_verified_stylist ? 'Sessions' : 'Sales'
                                }
                                onPress={() => setCurrentView('sales')}
                                colors={colors}
                                isDark={isDark}
                            />
                        )}
                        <MenuItem
                            icon="user"
                            label="Edit Profile"
                            onPress={() => {
                                onClose();
                                router.push('/edit-profile');
                            }}
                            colors={colors}
                            isDark={isDark}
                        />
                        <MenuItem
                            icon="edit-3"
                            label="Drafts"
                            onPress={() => setCurrentView('drafts')}
                            colors={colors}
                            isDark={isDark}
                        />
                        <MenuItem
                            icon="lock"
                            label="Privacy & Security"
                            onPress={() => setCurrentView('privacy')}
                            colors={colors}
                            isDark={isDark}
                        />
                        <MenuItem
                            icon="bell"
                            label="Notifications"
                            onPress={() => setCurrentView('notifications')}
                            colors={colors}
                            isDark={isDark}
                        />
                    </View>

                    {/* Business Switcher */}
                    <TouchableOpacity
                        style={[styles.businessItem, { backgroundColor: isDark ? '#27272a' : '#f9fafb' }]}
                        onPress={async () => {
                            const isBusiness = user?.is_business_account;

                            if (isBusiness) {
                                // Already business — switching back to personal is free
                                Alert.alert(
                                    'Switch to Personal',
                                    'Switch back to a Personal Account? Your shop will be hidden.',
                                    [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                            text: 'Confirm',
                                            onPress: async () => {
                                                // Through the server, because
                                                // the column is no longer
                                                // client-writable -- a grant
                                                // that allowed this downgrade
                                                // also allowed a free upgrade.
                                                const { error } = await supabase.rpc('downgrade_business_account');
                                                if (error) {
                                                    Alert.alert('Could Not Switch', error.message);
                                                    return;
                                                }
                                                setUser(user ? { ...user, is_business_account: false } : user);
                                            },
                                        },
                                    ]
                                );
                            } else {
                                // Not business — show subscription modal
                                requestPaywall('business');
                            }
                        }}
                    >
                        <Feather
                            name={user?.is_business_account ? "user" : "briefcase"}
                            size={20}
                            color={isDark ? '#60a5fa' : '#2563eb'}
                        />
                        <Text style={{ fontSize: 15, fontWeight: '500', color: isDark ? '#60a5fa' : '#2563eb' }}>
                            {user?.is_business_account ? 'Switch to Personal Account' : 'Switch to Business Account'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* App Section */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: isDark ? '#71717a' : '#9ca3af' }]}>App</Text>
                    <View style={{ gap: 4 }}>
                        <MenuItem
                            icon="moon"
                            label="Appearance"
                            onPress={() => setCurrentView('appearance')}
                            colors={colors}
                            isDark={isDark}
                        />
                        <MenuItem
                            icon="help-circle"
                            label="Help & Support"
                            onPress={() => setCurrentView('help')}
                            colors={colors}
                            isDark={isDark}
                        />
                    </View>
                </View>

                {/* Logout */}
                <View style={[styles.logoutSection, { borderTopColor: colors.border }]}>
                    <TouchableOpacity
                        style={[styles.logoutButton, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2' }]}
                        onPress={handleLogout}
                    >
                        <Feather name="log-out" size={20} color="#dc2626" />
                        <Text style={styles.logoutText}>Log Out</Text>
                    </TouchableOpacity>

                    {/* Delete Account — required for App Store (Guideline 5.1.1(v)) */}
                    <TouchableOpacity
                        style={styles.deleteAccountButton}
                        onPress={handleDeleteAccount}
                    >
                        <Feather name="trash-2" size={18} color={isDark ? '#71717a' : '#9ca3af'} />
                        <Text style={[styles.deleteAccountText, { color: isDark ? '#71717a' : '#9ca3af' }]}>
                            Delete Account
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <View style={[styles.footer, { borderTopColor: colors.border }]}>
                    <Text style={[styles.footerText, { color: isDark ? '#52525b' : '#9ca3af' }]}>Emode v1.0.0</Text>
                    <Text style={[styles.footerSubtext, { color: isDark ? '#3f3f46' : '#d1d5db' }]}>Fashion, community, and AI-assisted try-ons</Text>
                </View>
            </ScrollView>
        </>
    );

    const renderContent = () => {
        switch (currentView) {
            case 'appearance': return <AppearancePage onBack={() => setCurrentView('menu')} />;
            case 'notifications': return <NotificationsPage onBack={() => setCurrentView('menu')} />;
            case 'privacy': return <PrivacyPage onBack={() => setCurrentView('menu')} onNavigate={setCurrentView as any} />;
            case 'help': return <HelpPage onBack={() => setCurrentView('menu')} onNavigate={setCurrentView as any} />;

            // Sub-pages (Level 2)
            case 'loginActivity': return <LoginActivityPage onBack={() => setCurrentView('privacy')} />;
            case 'faqs': return <FAQsPage onBack={() => setCurrentView('help')} />;
            case 'contact': return <ContactPage onBack={() => setCurrentView('help')} />;
            case 'drafts': return (
                <DraftsPage
                    onBack={() => setCurrentView('menu')}
                    onCloseDrawer={onClose}
                />
            );
            case 'dressingRoom': return <DressingRoomPage onBack={() => setCurrentView('menu')} />;
            case 'cart': return <CartPage onBack={() => setCurrentView('menu')} />;
            case 'orders': return <OrdersPage onBack={() => setCurrentView('menu')} />;
            case 'sales': return <SalesPage onBack={() => setCurrentView('menu')} />;

            default: return renderMenu();
        }
    };

    if (!internalVisible) return null;

    return (
        <>
        <Modal
            visible={internalVisible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            {/* Backdrop with Blur */}
            <Animated.View style={[styles.backdropContainer, { opacity: fadeAnim }]}>
                {Platform.OS === 'ios' ? (
                    <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                ) : (
                    // Fallback for Android if blur is too heavy or not supported well without setup
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
                )}
                {/* On Android, add pressable overlay on TOP of blur/color */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </Animated.View>

            {/* Drawer */}
            <Animated.View
                style={[
                    styles.drawer,
                    {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        transform: [{ translateX: slideAnim }]
                    }
                ]}
            >
                {renderContent()}
            </Animated.View>
        </Modal>

        </>
    );
}

// Global Menu Item
function MenuItem({
    icon,
    label,
    onPress,
    colors,
    isDark,
    badge
}: {
    icon: string;
    label: string;
    onPress: () => void;
    colors: any;
    isDark: boolean;
    badge?: number;
}) {
    return (
        <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: isDark ? '#27272a' : 'transparent' }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={styles.menuItemLeft}>
                <Feather name={icon as any} size={20} color={isDark ? '#d4d4d8' : '#374151'} />
                <Text style={[styles.menuItemLabel, { color: colors.text }]}>{label}</Text>
                {badge !== undefined && badge > 0 && (
                    <View style={{
                        backgroundColor: '#ef4444',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 10,
                        marginLeft: 8
                    }}>
                        <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                            {badge > 99 ? '99+' : badge}
                        </Text>
                    </View>
                )}
            </View>
            <Feather name="chevron-right" size={16} color={isDark ? '#52525b' : '#d1d5db'} />
        </TouchableOpacity>
    );
}


const styles = StyleSheet.create({
    backdropContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)', // subtle tint even with blur
    },
    drawer: {
        position: 'absolute',
        left: 0, // Left side
        top: 0,
        bottom: 0,
        width: '85%',
        maxWidth: 400,
        borderTopRightRadius: 24, // rounded-r-3xl
        borderBottomRightRadius: 24,
        overflow: 'hidden',
        borderRightWidth: 1, // Border on right
        boxShadow: '4px 0px 4.65px rgba(0, 0, 0, 0.3)',
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    closeButton: {
        padding: 8,
        borderRadius: 999,
    },
    scrollContent: {
        flex: 1,
        padding: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 12,
        paddingHorizontal: 8,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    menuItemLabel: {
        fontSize: 15,
        fontWeight: '500',
    },
    businessItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        marginTop: 8,
    },
    logoutSection: {
        paddingTop: 16,
        borderTopWidth: 1,
        marginBottom: 8,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
    },
    logoutText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#dc2626',
    },
    deleteAccountButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        marginTop: 8,
    },
    deleteAccountText: {
        fontSize: 13,
        fontWeight: '500',
    },
    footer: {
        alignItems: 'center',
        paddingVertical: 24,
        borderTopWidth: 1,
    },
    footerText: {
        fontSize: 12,
    },
    footerSubtext: {
        fontSize: 10,
        marginTop: 4,
    }
});
