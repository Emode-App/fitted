import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Pressable, FlatList,
    Dimensions, SafeAreaView, ScrollView, Alert, TextInput, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, {
    SharedValue,
    useSharedValue,
    useAnimatedStyle,
    useAnimatedScrollHandler,
    interpolate,
    Extrapolation,
    withTiming,
    withDelay,
    withRepeat,
    withSequence,
    FadeIn,
    FadeInDown,
    Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSubscriptionPrice, purchaseSubscription, restorePurchases, type SubscriptionType } from '@/services/revenueCatService';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import { LEGAL } from '@/constants/legal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { ONBOARDING_MEDIA, type OnboardingSlot } from '@/constants/onboardingMedia';
import UserBadges from '@/components/UserBadges';

/**
 * Onboarding is painted in Emode's own colours, not the viewer's theme.
 *
 * This screen used to hardcode a dark palette -- black ground, near-black cards,
 * white type -- while the signature cream sat in the theme file being used by
 * nothing but the app icon. It is pinned to `emode` rather than read from
 * useTheme deliberately: this is the first thing anybody sees, and it should look
 * like the brand regardless of which theme they later pick or what their phone
 * is set to.
 */
const E = {
    ...Colors.emode,
    // Warmed locally, not in the shared palette. The emode theme's surfaces and
    // borders are cool zinc greys, which is the contrast the rest of the app is
    // built on -- Explore's ground, favourite buttons and every card read against
    // them. Warming them centrally to suit this one screen changed all of that,
    // so the cream tints stop here.
    surface: '#EFEBE3',      // cream, one step down
    surfaceDeep: '#E8E3D8',  // cream, two steps down
    hairline: '#DFD8CA',     // warm border
    mutedText: '#6B655A',    // warm grey, legible on cream
    faintText: '#8F887A',    // warm grey, muted
};

const { width: SW } = Dimensions.get('window');
export const ONBOARDING_KEY = 'has_onboarded';

/**
 * Per-account cache of the onboarding gate.
 *
 * The authoritative value is users.onboarded_at; this only covers the moment
 * before the profile has loaded. It is keyed by account because one shared flag
 * cannot say which of two signed-in accounts it referred to.
 */
export const onboardingKeyFor = (userId?: string | null) =>
    userId ? `${ONBOARDING_KEY}:${userId}` : ONBOARDING_KEY;

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

/**
 * How many accounts the follow step will ever render.
 *
 * There are only a handful of people here today, so this is a ceiling rather
 * than a target -- it exists so the step stays a short, scannable suggestion
 * once the app fills up, instead of turning into an endless directory.
 */
const SUGGESTED_LIMIT = 15;

interface SuggestedAccount {
    id: string;
    username: string | null;
    handle: string | null;
    avatar_url: string | null;
    bio: string | null;
    is_verified_stylist: boolean | null;
    is_business_account: boolean | null;
    is_verified_boutique: boolean | null;
}

// ─────────────────────────────────────── SLIDE DATA ───

const SLIDES = [
    { id: 'welcome' },
    {
        id: 'social',
        emoji: '🌟',
        media: 'feed' as const,
        title: 'Your Stage',
        body: 'Post your fits, tag what you wore, and find the people whose style you actually want to see.',
        gradient: ['#8b5cf6', '#3b82f6'] as const,
    },
    {
        id: 'fits',
        emoji: '🎨',
        media: 'board' as const,
        title: 'Build Your Fit',
        body: 'Drag pieces onto a canvas and style a board from your wardrobe, your camera roll, or anywhere on the web.',
        gradient: ['#8b5cf6', '#ec4899'] as const,
    },
    {
        id: 'ai',
        emoji: '🤖',
        media: 'tryOn' as const,
        title: 'See It On You',
        body: 'Upload one photo and try on anything — including the secondhand pieces your peers are selling. Welcome to your dressing room.',
        gradient: ['#06b6d4', '#3b82f6'] as const,
    },
    {
        id: 'styling',
        emoji: '👑',
        media: 'styling' as const,
        title: 'Get Styled. Or Style.',
        body: 'Book a verified stylist to put a look together for you — or become one, set your rate, and get paid for it.',
        gradient: ['#f59e0b', '#ef4444'] as const,
    },
    {
        id: 'shop',
        emoji: '🛍️',
        media: 'shop' as const,
        title: 'Shop & Sell',
        body: 'Save the pieces you love, and list your own from your profile. Secure checkout, straight to your account.',
        gradient: ['#10b981', '#06b6d4'] as const,
    },
] as const;

// ─────────────────────────────────────── PLAN DATA ────

const PLANS = [
    {
        id: 'proTryOns' as const,
        label: 'Pro Try-Ons',
        emoji: '✨',
        price: 'Monthly',
        tagline: 'For the experimenters',
        icon: 'cpu' as const,
        gradient: ['#06b6d4', '#3b82f6'] as const,
        perks: [
            'Up to 100 AI outfit generations per day',
            'Combine up to 6 clothing references',
            'Private saved try-on history',
            'Access restored across devices',
        ],
    },
    {
        id: 'business' as const,
        label: 'Business',
        emoji: '🛍️',
        price: 'Monthly',
        tagline: 'For brands & sellers',
        icon: 'shopping-bag' as const,
        gradient: ['#8b5cf6', '#ec4899'] as const,
        perks: [
            'Business badge and profile shop',
            'Create physical product listings',
            'Accept eligible physical-goods orders',
            'View sales and fulfillment status',
        ],
    },
    {
        id: 'stylist' as const,
        label: 'Stylist',
        emoji: '👑',
        price: 'Monthly',
        tagline: 'For professional stylists',
        icon: 'star' as const,
        gradient: ['#f59e0b', '#ef4444'] as const,
        perks: [
            'Verified stylist badge on profile',
            'Set a public styling rate',
            'Receive styling requests in messages',
            'Restore access across devices',
        ],
    },
];

// ─────────────────────────────────────── SMALL PIECES ───

// Gradient pill CTA used across all steps.
function GradientButton({
    label,
    onPress,
    disabled,
    icon,
    colors = ['#8b5cf6', '#ec4899'] as const,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    icon?: keyof typeof Feather.glyphMap;
    colors?: readonly [string, string, ...string[]];
}) {
    return (
        <Pressable onPress={onPress} disabled={disabled} style={disabled && { opacity: 0.6 }}>
            <LinearGradient
                colors={colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientBtn}
            >
                <Text style={styles.gradientBtnText}>{label}</Text>
                {icon && <Feather name={icon} size={16} color="#fff" style={{ marginLeft: 8 }} />}
            </LinearGradient>
        </Pressable>
    );
}

// Looping bob/rotate for decorative emojis on the welcome slide.
function FloatingEmoji({
    emoji,
    style,
    delay = 0,
    size = 30,
}: {
    emoji: string;
    style?: any;
    delay?: number;
    size?: number;
}) {
    const t = useSharedValue(0);

    useEffect(() => {
        t.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
                    withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
                ),
                -1,
                true,
            ),
        );
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: interpolate(t.value, [0, 1], [0, -16]) },
            { rotate: `${interpolate(t.value, [0, 1], [-8, 8])}deg` },
        ],
    }));

    return (
        <Animated.Text style={[styles.floatEmoji, { fontSize: size }, style, animStyle]}>
            {emoji}
        </Animated.Text>
    );
}

// One paging slide. Content does a parallax reveal driven by horizontal scroll.
function Slide({ item, index, scrollX }: { item: any; index: number; scrollX: SharedValue<number> }) {
    const inputRange = [(index - 1) * SW, index * SW, (index + 1) * SW];

    const contentStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolation.CLAMP),
        transform: [
            { translateY: interpolate(scrollX.value, inputRange, [50, 0, 50], Extrapolation.CLAMP) },
            { scale: interpolate(scrollX.value, inputRange, [0.9, 1, 0.9], Extrapolation.CLAMP) },
        ],
    }));

    if (item.id === 'welcome') {
        return (
            <View style={styles.slide}>
                {/* Floating decorations */}
                <FloatingEmoji emoji="✨" size={34} delay={0} style={{ top: 90, right: 40 }} />
                <FloatingEmoji emoji="👗" size={30} delay={400} style={{ top: 160, left: 36 }} />
                <FloatingEmoji emoji="🔥" size={28} delay={800} style={{ top: 110, left: 150 }} />
                <FloatingEmoji emoji="💎" size={26} delay={1200} style={{ bottom: 230, right: 60 }} />

                <Animated.View style={[styles.welcomeContent, contentStyle]}>
                    <MaskedView maskElement={<Text style={styles.appName}>emode</Text>}>
                        <LinearGradient
                            colors={['#18181b', '#8b5cf6', '#ec4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Text style={[styles.appName, { opacity: 0 }]}>emode</Text>
                        </LinearGradient>
                    </MaskedView>
                    <Text style={styles.tagline}>internet{'\n'}fashion.</Text>
                    <Text style={styles.welcomeBody}>
                        The platform built for the fashion-forward.
                    </Text>
                </Animated.View>
            </View>
        );
    }

    const art = 'media' in item ? ONBOARDING_MEDIA[item.media as OnboardingSlot] : null;

    return (
        <View style={styles.slide}>
            <Animated.View style={[styles.featureContent, contentStyle]}>
                {art ? (
                    // The screen itself, sitting behind its own colour wash. A
                    // slide that shows the thing beats a slide that describes it.
                    <View style={styles.artWrap}>
                        <LinearGradient
                            colors={item.gradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.artGlow}
                        />
                        <Image source={art} style={styles.art} contentFit="contain" />
                    </View>
                ) : (
                    <View style={styles.iconWrap}>
                        {/* Soft color halo */}
                        <LinearGradient
                            colors={item.gradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.iconGlow}
                        />
                        <LinearGradient
                            colors={item.gradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.featureIconCircle}
                        >
                            <Text style={styles.featureEmoji}>{item.emoji}</Text>
                        </LinearGradient>
                    </View>
                )}
                <Text style={styles.featureTitle}>{item.title}</Text>
                <Text style={styles.featureBody}>{item.body}</Text>
            </Animated.View>
        </View>
    );
}

// Progress dot that grows + brightens as its slide becomes active.
function Dot({ index, scrollX }: { index: number; scrollX: SharedValue<number> }) {
    const inputRange = [(index - 1) * SW, index * SW, (index + 1) * SW];

    const dotStyle = useAnimatedStyle(() => ({
        width: interpolate(scrollX.value, inputRange, [6, 24, 6], Extrapolation.CLAMP),
        opacity: interpolate(scrollX.value, inputRange, [0.3, 1, 0.3], Extrapolation.CLAMP),
    }));

    return <Animated.View style={[styles.dot, dotStyle]} />;
}

// ─────────────────────────────────────── COMPONENT ───

export default function OnboardingScreen() {
    const listRef = useRef<FlatList>(null);
    const scrollX = useSharedValue(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [step, setStep] = useState<'slides' | 'profile' | 'follow' | 'paywall'>('slides');
    const [suggested, setSuggested] = useState<SuggestedAccount[]>([]);
    const [following, setFollowing] = useState<Set<string>>(new Set());
    const [loadingSuggested, setLoadingSuggested] = useState(false);
    const insets = useSafeAreaInsets();
    const [activePlan, setActivePlan] = useState(0);
    const [purchasing, setPurchasing] = useState(false);
    const [storePrices, setStorePrices] = useState<Record<SubscriptionType, string | null>>({ stylist: null, business: null, proTryOns: null });

    const user = useAuthStore((state) => state.user);
    const updateProfile = useAuthStore((state) => state.updateProfile);

    // Profile step state
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [bio, setBio] = useState('');
    const [location, setLocation] = useState('');
    const [favoriteBrand, setFavoriteBrand] = useState('');
    const [songTitle, setSongTitle] = useState('');
    const [songArtist, setSongArtist] = useState('');
    const [website, setWebsite] = useState('');
    const [instagram, setInstagram] = useState('');
    const [tiktok, setTiktok] = useState('');
    const [twitter, setTwitter] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    const isLastSlide = currentIndex === SLIDES.length - 1;

    useEffect(() => {
        if (step !== 'follow' || !user?.id) return;
        let cancelled = false;
        setLoadingSuggested(true);

        (async () => {
            // Verified stylists first -- they are the reason someone would follow
            // anybody on their first day -- then the rest by how much they have
            // posted. Capped well under the render limit so the list stays a
            // suggestion rather than a directory as the app fills up.
            const { data } = await supabase
                .from('users')
                .select('id, username, handle, avatar_url, bio, is_verified_stylist, is_business_account, is_verified_boutique')
                .neq('id', user.id)
                .order('is_verified_stylist', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(SUGGESTED_LIMIT);

            if (cancelled) return;
            setSuggested((data ?? []) as SuggestedAccount[]);
            setLoadingSuggested(false);
        })();

        return () => { cancelled = true; };
    }, [step, user?.id]);

    const toggleFollow = async (accountId: string) => {
        if (!user?.id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

        const wasFollowing = following.has(accountId);
        const next = new Set(following);
        if (wasFollowing) next.delete(accountId); else next.add(accountId);
        setFollowing(next);

        try {
            if (wasFollowing) {
                await supabase.from('follows').delete()
                    .eq('follower_id', user.id).eq('following_id', accountId);
            } else {
                await supabase.from('follows')
                    .insert({ follower_id: user.id, following_id: accountId });
                await supabase.from('notifications').insert({
                    user_id: accountId, actor_id: user.id, type: 'follow',
                });
            }
        } catch (error) {
            console.warn('[onboarding] follow failed:', error);
            const reverted = new Set(following);
            if (wasFollowing) reverted.add(accountId); else reverted.delete(accountId);
            setFollowing(reverted);
        }
    };

    useEffect(() => {
        if (step !== 'paywall') return;
        Promise.all((['proTryOns', 'business', 'stylist'] as SubscriptionType[]).map(async (type) => [type, await getSubscriptionPrice(type)] as const))
            .then((entries) => setStorePrices(Object.fromEntries(entries) as Record<SubscriptionType, string | null>));
    }, [step]);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (e) => {
            scrollX.value = e.contentOffset.x;
        },
    });

    const completeOnboarding = async () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Record it on the account first so it survives this device, then cache it
        // locally for the next launch before the profile has come back.
        try {
            await updateProfile({ onboarded_at: new Date().toISOString() });
        } catch {
            // A failed write must not trap someone on the last onboarding screen;
            // the local flag below still gets them through, and the next completed
            // profile update will carry the timestamp.
        }
        await AsyncStorage.setItem(onboardingKeyFor(useAuthStore.getState().user?.id), 'true');
        router.replace('/(tabs)');
    };

    const handleNext = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (isLastSlide) {
            setStep('profile');
        } else {
            const next = currentIndex + 1;
            listRef.current?.scrollToIndex({ index: next, animated: true });
            setCurrentIndex(next);
        }
    };

    const pickAvatar = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (!result.canceled && result.assets[0]) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setAvatarUri(result.assets[0].uri);
        }
    };

    const handleSaveProfile = async () => {
        if (!user) {
            setStep('follow');
            return;
        }

        setSavingProfile(true);
        try {
            const updates: Record<string, any> = {};

            if (avatarUri) {
                const response = await fetch(avatarUri);
                const blob = await response.blob();
                const arrayBuffer = await new Response(blob).arrayBuffer();
                const fileName = `${user.id}/avatar_${Date.now()}.jpg`;
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
                if (!uploadError) {
                    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
                    updates.avatar_url = urlData.publicUrl;
                }
            }

            if (bio.trim()) updates.bio = bio.trim();
            if (location.trim()) updates.location = location.trim();
            if (favoriteBrand.trim()) updates.favorite_brand = favoriteBrand.trim();
            if (website.trim()) updates.website = website.trim();
            if (songTitle.trim()) {
                updates.favorite_song = { title: songTitle.trim(), artist: songArtist.trim() };
            }
            if (instagram.trim() || tiktok.trim() || twitter.trim()) {
                updates.socials = {
                    ...(instagram.trim() ? { instagram: instagram.trim() } : {}),
                    ...(tiktok.trim() ? { tiktok: tiktok.trim() } : {}),
                    ...(twitter.trim() ? { twitter: twitter.trim() } : {}),
                };
            }

            if (Object.keys(updates).length > 0) {
                await updateProfile(updates);
            }
        } catch (error) {
            console.error('Error saving onboarding profile:', error);
        } finally {
            setSavingProfile(false);
            setStep('follow');
        }
    };

    const handleSubscribe = async () => {
        const plan = PLANS[activePlan];
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setPurchasing(true);
        const { success, error } = await purchaseSubscription(plan.id);
        setPurchasing(false);
        if (success) {
            completeOnboarding();
        } else if (error && error !== 'cancelled') {
            Alert.alert('Purchase Failed', error);
        }
    };

    const handleRestore = async () => {
        setPurchasing(true);
        const { success, activeEntitlements, error } = await restorePurchases();
        setPurchasing(false);
        if (!success) return Alert.alert('Restore Failed', error || 'Could not restore purchases.');
        Alert.alert('Purchases Restored', activeEntitlements.length ? 'Your active subscriptions were restored.' : 'No active subscriptions were found.', [
            { text: 'Continue', onPress: completeOnboarding },
        ]);
    };

    // ─── PROFILE SETUP ───────────────────────────────────────────
    if (step === 'profile') {
        return (
            <View style={styles.container}>
                <StatusBar style="dark" />
                <SafeAreaView style={{ flex: 1 }}>
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.profileScroll}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Animated.View entering={FadeInDown.duration(500)}>
                            <Text style={styles.profileTitle}>You ✦</Text>
                            <Text style={styles.profileSubtitle}>
                                Add a few personal touches. Everything here is optional — you can edit it anytime in Settings.
                            </Text>
                        </Animated.View>

                        <Animated.View entering={FadeIn.delay(150).duration(500)}>
                            <Pressable style={styles.avatarPicker} onPress={pickAvatar}>
                                {avatarUri ? (
                                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                                ) : (
                                    <LinearGradient
                                        colors={['#8b5cf6', '#ec4899']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.avatarRing}
                                    >
                                        <View style={styles.avatarPlaceholder}>
                                            <Feather name="camera" size={24} color={E.mutedText} />
                                        </View>
                                    </LinearGradient>
                                )}
                                <Text style={styles.avatarLabel}>
                                    {avatarUri ? 'Change photo' : '📸 Add a profile photo'}
                                </Text>
                            </Pressable>
                        </Animated.View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>Bio</Text>
                            <TextInput
                                style={[styles.input, styles.inputMultiline]}
                                placeholder="Tell people about your style..."
                                placeholderTextColor={E.faintText}
                                value={bio}
                                onChangeText={setBio}
                                multiline
                                maxLength={150}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>📍 Location</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="City, Country"
                                placeholderTextColor={E.faintText}
                                value={location}
                                onChangeText={setLocation}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>🏷️ Favorite Brand</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Carhartt WIP"
                                placeholderTextColor={E.faintText}
                                value={favoriteBrand}
                                onChangeText={setFavoriteBrand}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>🎵 Favorite Song</Text>
                            <View style={styles.row}>
                                <TextInput
                                    style={[styles.input, styles.rowInput]}
                                    placeholder="Title"
                                    placeholderTextColor={E.faintText}
                                    value={songTitle}
                                    onChangeText={setSongTitle}
                                />
                                <TextInput
                                    style={[styles.input, styles.rowInput]}
                                    placeholder="Artist"
                                    placeholderTextColor={E.faintText}
                                    value={songArtist}
                                    onChangeText={setSongArtist}
                                />
                            </View>
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>🔗 Website</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="yoursite.com"
                                placeholderTextColor={E.faintText}
                                autoCapitalize="none"
                                value={website}
                                onChangeText={setWebsite}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>Socials</Text>
                            <View style={styles.socialRow}>
                                <Feather name="instagram" size={18} color={E.mutedText} style={styles.socialIcon} />
                                <TextInput
                                    style={[styles.input, styles.socialInput]}
                                    placeholder="Instagram username"
                                    placeholderTextColor={E.faintText}
                                    autoCapitalize="none"
                                    value={instagram}
                                    onChangeText={setInstagram}
                                />
                            </View>
                            <View style={styles.socialRow}>
                                <Feather name="music" size={18} color={E.mutedText} style={styles.socialIcon} />
                                <TextInput
                                    style={[styles.input, styles.socialInput]}
                                    placeholder="TikTok username"
                                    placeholderTextColor={E.faintText}
                                    autoCapitalize="none"
                                    value={tiktok}
                                    onChangeText={setTiktok}
                                />
                            </View>
                            <View style={styles.socialRow}>
                                <Feather name="twitter" size={18} color={E.mutedText} style={styles.socialIcon} />
                                <TextInput
                                    style={[styles.input, styles.socialInput]}
                                    placeholder="Twitter / X username"
                                    placeholderTextColor={E.faintText}
                                    autoCapitalize="none"
                                    value={twitter}
                                    onChangeText={setTwitter}
                                />
                            </View>
                        </View>
                    </ScrollView>

                    <View style={styles.profileFooter}>
                        <GradientButton
                            label={savingProfile ? 'Saving...' : 'Continue'}
                            onPress={handleSaveProfile}
                            disabled={savingProfile}
                        />
                        <Pressable onPress={() => setStep('follow')} style={styles.skipBtn} disabled={savingProfile}>
                            <Text style={styles.skipText}>Skip for now  →</Text>
                        </Pressable>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // ─── PAYWALL ─────────────────────────────────────────────────
    if (step === 'follow') {
        return (
            <View style={styles.container}>
                <StatusBar style="dark" />
                <SafeAreaView style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.profileScroll} keyboardShouldPersistTaps="handled">
                        <Text style={styles.profileTitle}>Find your people</Text>
                        <Text style={styles.profileSubtitle}>
                            Follow a few accounts so your feed has something in it. You can change this any time.
                        </Text>

                        {loadingSuggested ? (
                            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                                <Text style={{ color: E.mutedText }}>Looking for accounts…</Text>
                            </View>
                        ) : suggested.length === 0 ? (
                            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                                <Text style={{ color: E.mutedText, textAlign: 'center' }}>
                                    Nobody to suggest yet — you are early. Your feed fills up as people join.
                                </Text>
                            </View>
                        ) : (
                            <View style={{ gap: 10, marginTop: 8 }}>
                                {suggested.map((account) => {
                                    const isFollowing = following.has(account.id);
                                    return (
                                        <View key={account.id} style={styles.suggestRow}>
                                            {account.avatar_url ? (
                                                <Image source={{ uri: account.avatar_url }} style={styles.suggestAvatar} />
                                            ) : (
                                                <View style={[styles.suggestAvatar, styles.suggestAvatarEmpty]}>
                                                    <Feather name="user" size={18} color={E.faintText} />
                                                </View>
                                            )}

                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                    <Text style={styles.suggestName} numberOfLines={1}>
                                                        {account.username || 'Emode user'}
                                                    </Text>
                                                    <UserBadges user={account} size={13} />
                                                </View>
                                                <Text style={styles.suggestMeta} numberOfLines={1}>
                                                    {account.is_verified_stylist
                                                        ? 'Verified stylist'
                                                        : account.bio?.trim() || account.handle || ''}
                                                </Text>
                                            </View>

                                            <Pressable
                                                onPress={() => toggleFollow(account.id)}
                                                style={[
                                                    styles.followBtn,
                                                    isFollowing
                                                        ? { backgroundColor: 'transparent', borderColor: E.hairline }
                                                        : { backgroundColor: E.primary, borderColor: E.primary },
                                                ]}
                                            >
                                                <Text style={{
                                                    fontSize: 13,
                                                    fontWeight: '700',
                                                    color: isFollowing ? E.mutedText : E.primaryForeground,
                                                }}>
                                                    {isFollowing ? 'Following' : 'Follow'}
                                                </Text>
                                            </Pressable>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        <View style={{ marginTop: 28 }}>
                            <GradientButton
                                label={following.size > 0 ? `Continue with ${following.size}` : 'Continue'}
                                onPress={() => setStep('paywall')}
                                icon="arrow-right"
                            />
                        </View>
                        <Pressable onPress={() => setStep('paywall')} style={styles.skipBtn}>
                            <Text style={styles.skipText}>Skip for now</Text>
                        </Pressable>
                    </ScrollView>
                </SafeAreaView>
            </View>
        );
    }

    if (step === 'paywall') {
        const plan = PLANS[activePlan];
        const displayPrice = storePrices[plan.id] || plan.price;
        return (
            <View style={styles.container}>
                <StatusBar style="dark" />
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={styles.paywallInner}>

                        {/* Back */}
                        <Pressable onPress={() => setStep('follow')} style={styles.backBtn} hitSlop={12}>
                            <Feather name="arrow-left" size={20} color={E.text} />
                        </Pressable>

                        {/* Heading */}
                        <Animated.View entering={FadeInDown.duration(500)}>
                            <Text style={styles.paywallTitle}>Level Up 🚀</Text>
                            <Text style={styles.paywallSubtitle}>Choose the plan that fits your goals</Text>
                        </Animated.View>

                        {/* Plan tabs */}
                        <View style={styles.planTabs}>
                            {PLANS.map((p, i) => (
                                <Pressable
                                    key={p.id}
                                    onPress={() => {
                                        Haptics.selectionAsync().catch(() => {});
                                        setActivePlan(i);
                                    }}
                                    style={[styles.planTab, i === activePlan && styles.planTabActive]}
                                >
                                    <Text style={[styles.planTabText, i === activePlan && styles.planTabTextActive]}>
                                        {p.emoji} {p.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        {/* Plan card */}
                        <ScrollView
                            style={{ flex: 1 }}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 12 }}
                        >
                            <Animated.View
                                key={plan.id}
                                entering={FadeIn.duration(350)}
                                style={styles.planCard}
                            >
                                {/* Card header */}
                                <View style={styles.planCardHead}>
                                    <LinearGradient
                                        colors={plan.gradient}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.planIconCircle}
                                    >
                                        <Text style={styles.planIconEmoji}>{plan.emoji}</Text>
                                    </LinearGradient>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.planName}>{plan.label}</Text>
                                        <Text style={styles.planTagline}>{plan.tagline}</Text>
                                    </View>
                                    <Text style={styles.planPrice}>{displayPrice}</Text>
                                </View>

                                <View style={styles.planDivider} />

                                {plan.perks.map((perk, i) => (
                                    <View key={i} style={styles.perkRow}>
                                        <LinearGradient
                                            colors={plan.gradient}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.checkCircle}
                                        >
                                            <Feather name="check" size={11} color="#fff" />
                                        </LinearGradient>
                                        <Text style={styles.perkText}>{perk}</Text>
                                    </View>
                                ))}
                            </Animated.View>
                        </ScrollView>

                        {/* Footer CTA */}
                        <View style={styles.paywallFooter}>
                            <GradientButton
                                label={purchasing ? 'Processing...' : `Subscribe · ${displayPrice}`}
                                onPress={handleSubscribe}
                                disabled={purchasing}
                                colors={plan.gradient}
                            />
                            <Pressable onPress={completeOnboarding} style={styles.skipBtn}>
                                <Text style={styles.skipText}>Continue for free  →</Text>
                            </Pressable>
                            <Pressable onPress={handleRestore} style={styles.skipBtn} disabled={purchasing}>
                                <Text style={styles.skipText}>Restore Purchases</Text>
                            </Pressable>
                            <Text style={styles.skipText}>
                                Renews monthly until canceled.{' '}
                                <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(LEGAL.termsUrl)}>Terms</Text>{' · '}
                                <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(LEGAL.privacyPolicyUrl)}>Privacy</Text>
                            </Text>
                        </View>

                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // ─── CONTENT SLIDES ──────────────────────────────────────────
    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            <AnimatedFlatList
                ref={listRef as any}
                data={SLIDES as any}
                keyExtractor={(item: any) => item.id}
                horizontal
                pagingEnabled
                scrollEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(e) => {
                    setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / SW));
                }}
                renderItem={({ item, index }: any) => (
                    <Slide item={item} index={index} scrollX={scrollX} />
                )}
            />

            {/* Dots + Next */}
            <View style={[styles.bottomNav, { paddingBottom: 20 + insets.bottom }]}>
                <View style={styles.dots}>
                    {SLIDES.map((_, i) => (
                        <Dot key={i} index={i} scrollX={scrollX} />
                    ))}
                </View>
                <GradientButton
                    label={isLastSlide ? 'See Plans' : 'Next'}
                    onPress={handleNext}
                    icon={isLastSlide ? 'arrow-right' : undefined}
                />
            </View>
        </View>
    );
}

// ─────────────────────────────────────── STYLES ──────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: E.background,
    },

    // ── Slides ──────────────────────────────────────────
    artWrap: {
        alignItems: 'center',
        justifyContent: 'flex-end',
        // No margin of its own. featureContent already puts a gap under it, and
        // the two stacked left the phone floating well clear of its heading.
        marginBottom: 0,
    },
    art: {
        width: SW * 0.56,
        height: SW * 1.02,
    },
    artGlow: {
        position: 'absolute',
        width: SW * 0.7,
        height: SW * 0.7,
        borderRadius: SW * 0.35,
        opacity: 0.16,
        top: SW * 0.12,
    },
    slide: {
        width: SW,
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingBottom: 140,
    },

    // Welcome slide
    welcomeContent: {
        gap: 16,
    },
    appName: {
        fontFamily: 'Inter_900Black',
        fontSize: 80,
        color: E.text,
        letterSpacing: -5,
        lineHeight: 76,
    },
    tagline: {
        fontFamily: 'Inter_700Bold',
        fontSize: 38,
        color: E.text,
        letterSpacing: -2,
        lineHeight: 42,
    },
    welcomeBody: {
        fontSize: 16,
        color: E.mutedText,
        lineHeight: 25,
        marginTop: 6,
    },
    floatEmoji: {
        position: 'absolute',
    },

    // Feature slides
    featureContent: {
        // Tight enough that the screenshot reads as belonging to the heading
        // beneath it, loose enough not to collide with it.
        gap: 18,
    },
    iconWrap: {
        width: 96,
        height: 96,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconGlow: {
        position: 'absolute',
        width: 96,
        height: 96,
        borderRadius: 48,
        opacity: 0.35,
        transform: [{ scale: 1.35 }],
    },
    featureIconCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featureEmoji: {
        fontSize: 44,
    },
    featureTitle: {
        fontFamily: 'Inter_700Bold',
        fontSize: 38,
        color: E.text,
        letterSpacing: -1.5,
        lineHeight: 42,
    },
    featureBody: {
        fontSize: 16,
        color: E.mutedText,
        lineHeight: 26,
    },

    // ── Bottom nav ──────────────────────────────────────
    bottomNav: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 32,
        gap: 20,
    },
    dots: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
    },
    dot: {
        height: 6,
        borderRadius: 3,
        backgroundColor: E.text,
    },

    // Gradient CTA
    gradientBtn: {
        borderRadius: 14,
        paddingVertical: 17,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    gradientBtnText: {
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
        color: '#fff',
    },

    suggestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#DFD8CA',
        backgroundColor: '#EFEBE3',
    },
    suggestAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
    },
    suggestAvatarEmpty: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#E8E3D8',
    },
    suggestName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#09090b',
        fontFamily: 'Inter_700Bold',
    },
    suggestMeta: {
        fontSize: 12.5,
        color: '#6B655A',
        marginTop: 1,
    },
    followBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
    },

    // ── Paywall ─────────────────────────────────────────
    paywallInner: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: E.hairline,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    paywallTitle: {
        fontFamily: 'Inter_900Black',
        fontSize: 52,
        color: E.text,
        letterSpacing: -3,
        lineHeight: 52,
    },
    paywallSubtitle: {
        fontSize: 15,
        color: E.mutedText,
        marginTop: 8,
        marginBottom: 24,
    },

    // Plan tabs
    planTabs: {
        flexDirection: 'row',
        backgroundColor: E.surface,
        borderRadius: 12,
        padding: 4,
        marginBottom: 20,
    },
    planTab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    planTabActive: {
        backgroundColor: E.primary,
    },
    planTabText: {
        fontSize: 12,
        fontWeight: '700',
        color: E.mutedText,
    },
    planTabTextActive: {
        color: E.primaryForeground,
    },

    // Plan card
    planCard: {
        backgroundColor: E.surface,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: E.hairline,
    },
    planCardHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 20,
    },
    planIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    planIconEmoji: {
        fontSize: 22,
    },
    planName: {
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
        color: E.text,
    },
    planTagline: {
        fontSize: 13,
        color: E.mutedText,
        marginTop: 2,
    },
    planPrice: {
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
        color: E.text,
    },
    planDivider: {
        height: 1,
        backgroundColor: E.hairline,
        marginBottom: 20,
    },
    perkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    perkText: {
        fontSize: 15,
        color: E.text,
        lineHeight: 22,
        flex: 1,
    },

    // Footer
    paywallFooter: {
        paddingBottom: 16,
        gap: 4,
    },
    skipBtn: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    skipText: {
        fontSize: 14,
        color: E.faintText,
    },

    // ── Profile setup ────────────────────────────────────
    profileScroll: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 24,
    },
    profileTitle: {
        fontFamily: 'Inter_900Black',
        fontSize: 52,
        color: E.text,
        letterSpacing: -3,
        lineHeight: 52,
    },
    profileSubtitle: {
        fontSize: 15,
        color: E.mutedText,
        marginTop: 8,
        marginBottom: 24,
        lineHeight: 21,
    },
    avatarPicker: {
        alignItems: 'center',
        marginBottom: 28,
        gap: 10,
    },
    avatarImage: {
        width: 84,
        height: 84,
        borderRadius: 42,
    },
    avatarRing: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: E.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLabel: {
        fontSize: 13,
        color: E.mutedText,
    },
    fieldGroup: {
        marginBottom: 18,
    },
    fieldLabel: {
        fontFamily: 'Inter_700Bold',
        fontSize: 13,
        color: E.text,
        marginBottom: 8,
    },
    input: {
        backgroundColor: E.surface,
        borderWidth: 1,
        borderColor: E.hairline,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: E.text,
    },
    inputMultiline: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    row: {
        flexDirection: 'row',
        gap: 10,
    },
    rowInput: {
        flex: 1,
    },
    socialRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
    },
    socialIcon: {
        width: 18,
    },
    socialInput: {
        flex: 1,
    },
    profileFooter: {
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 4,
    },
});
