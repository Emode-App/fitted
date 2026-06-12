import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Pressable, FlatList,
    Dimensions, SafeAreaView, ScrollView, Alert, TextInput,
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
import { purchaseSubscription } from '@/services/revenueCatService';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';

const { width: SW } = Dimensions.get('window');
export const ONBOARDING_KEY = 'has_onboarded';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

// ─────────────────────────────────────── SLIDE DATA ───

const SLIDES = [
    { id: 'welcome' },
    {
        id: 'fits',
        emoji: '🎨',
        title: 'Build Your Fit',
        body: 'Drag and drop pieces onto a canvas. Style mood boards with anything from your wardrobe or the web.',
        gradient: ['#8b5cf6', '#ec4899'] as const,
    },
    {
        id: 'ai',
        emoji: '🤖',
        title: 'Try On Anything',
        body: 'Upload a photo and let AI style you in any outfit — no fitting room, no guesswork.',
        gradient: ['#06b6d4', '#3b82f6'] as const,
    },
    {
        id: 'social',
        emoji: '🌟',
        title: 'Your Stage',
        body: 'Share fits, discover creators, and build a following around your personal style.',
        gradient: ['#f59e0b', '#ef4444'] as const,
    },
] as const;

// ─────────────────────────────────────── PLAN DATA ────

const PLANS = [
    {
        id: 'proTryOns' as const,
        label: 'Pro Try-Ons',
        emoji: '✨',
        price: '$10/mo',
        tagline: 'For the experimenters',
        icon: 'cpu' as const,
        gradient: ['#06b6d4', '#3b82f6'] as const,
        perks: [
            'Unlimited AI outfit generations',
            'Access all AI styles & models',
            'Higher-resolution outputs',
            'Priority rendering queue',
            'Save unlimited AI looks to wardrobe',
        ],
    },
    {
        id: 'business' as const,
        label: 'Business',
        emoji: '🛍️',
        price: '$15/mo',
        tagline: 'For brands & sellers',
        icon: 'shopping-bag' as const,
        gradient: ['#8b5cf6', '#ec4899'] as const,
        perks: [
            'Business badge on your profile',
            'Create a shoppable storefront',
            'List & sell clothing directly in-app',
            'Accept payments through the app',
            'Sales analytics dashboard',
        ],
    },
    {
        id: 'stylist' as const,
        label: 'Stylist',
        emoji: '👑',
        price: '$25/mo',
        tagline: 'For professional stylists',
        icon: 'star' as const,
        gradient: ['#f59e0b', '#ef4444'] as const,
        perks: [
            'Verified stylist badge on profile',
            'Appear in stylist discovery',
            'Accept styling requests from users',
            'Set your rate & earn from sessions',
            'Priority placement in suggestions',
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
                            colors={['#ffffff', '#e9d5ff', '#fbcfe8']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Text style={[styles.appName, { opacity: 0 }]}>emode</Text>
                        </LinearGradient>
                    </MaskedView>
                    <Text style={styles.tagline}>internet{'\n'}fashion.</Text>
                    <Text style={styles.welcomeBody}>
                        The platform built for fashion-forward creators. 🚀
                    </Text>
                </Animated.View>
            </View>
        );
    }

    return (
        <View style={styles.slide}>
            <Animated.View style={[styles.featureContent, contentStyle]}>
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
    const [step, setStep] = useState<'slides' | 'profile' | 'paywall'>('slides');
    const [activePlan, setActivePlan] = useState(0);
    const [purchasing, setPurchasing] = useState(false);

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

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (e) => {
            scrollX.value = e.contentOffset.x;
        },
    });

    const completeOnboarding = async () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
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
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant photo library access to add a profile photo.');
            return;
        }
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
            setStep('paywall');
            return;
        }

        setSavingProfile(true);
        try {
            const updates: Record<string, any> = {};

            if (avatarUri) {
                const response = await fetch(avatarUri);
                const blob = await response.blob();
                const arrayBuffer = await new Response(blob).arrayBuffer();
                const fileName = `avatars/${user.id}/${Date.now()}.jpg`;
                const { error: uploadError } = await supabase.storage
                    .from('posts')
                    .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
                if (!uploadError) {
                    const { data: urlData } = supabase.storage.from('posts').getPublicUrl(fileName);
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
            setStep('paywall');
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

    // ─── PROFILE SETUP ───────────────────────────────────────────
    if (step === 'profile') {
        return (
            <View style={styles.container}>
                <StatusBar style="light" />
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
                                            <Feather name="camera" size={24} color="#a1a1aa" />
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
                                placeholderTextColor="#52525b"
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
                                placeholderTextColor="#52525b"
                                value={location}
                                onChangeText={setLocation}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>🏷️ Favorite Brand</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Carhartt WIP"
                                placeholderTextColor="#52525b"
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
                                    placeholderTextColor="#52525b"
                                    value={songTitle}
                                    onChangeText={setSongTitle}
                                />
                                <TextInput
                                    style={[styles.input, styles.rowInput]}
                                    placeholder="Artist"
                                    placeholderTextColor="#52525b"
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
                                placeholderTextColor="#52525b"
                                autoCapitalize="none"
                                value={website}
                                onChangeText={setWebsite}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>Socials</Text>
                            <View style={styles.socialRow}>
                                <Feather name="instagram" size={18} color="#71717a" style={styles.socialIcon} />
                                <TextInput
                                    style={[styles.input, styles.socialInput]}
                                    placeholder="Instagram username"
                                    placeholderTextColor="#52525b"
                                    autoCapitalize="none"
                                    value={instagram}
                                    onChangeText={setInstagram}
                                />
                            </View>
                            <View style={styles.socialRow}>
                                <Feather name="music" size={18} color="#71717a" style={styles.socialIcon} />
                                <TextInput
                                    style={[styles.input, styles.socialInput]}
                                    placeholder="TikTok username"
                                    placeholderTextColor="#52525b"
                                    autoCapitalize="none"
                                    value={tiktok}
                                    onChangeText={setTiktok}
                                />
                            </View>
                            <View style={styles.socialRow}>
                                <Feather name="twitter" size={18} color="#71717a" style={styles.socialIcon} />
                                <TextInput
                                    style={[styles.input, styles.socialInput]}
                                    placeholder="Twitter / X username"
                                    placeholderTextColor="#52525b"
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
                        <Pressable onPress={() => setStep('paywall')} style={styles.skipBtn} disabled={savingProfile}>
                            <Text style={styles.skipText}>Skip for now  →</Text>
                        </Pressable>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // ─── PAYWALL ─────────────────────────────────────────────────
    if (step === 'paywall') {
        const plan = PLANS[activePlan];
        return (
            <View style={styles.container}>
                <StatusBar style="light" />
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={styles.paywallInner}>

                        {/* Back */}
                        <Pressable onPress={() => setStep('profile')} style={styles.backBtn} hitSlop={12}>
                            <Feather name="arrow-left" size={20} color="#fff" />
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
                                    <Text style={styles.planPrice}>{plan.price}</Text>
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
                                label={purchasing ? 'Processing...' : `Subscribe · ${plan.price}`}
                                onPress={handleSubscribe}
                                disabled={purchasing}
                                colors={plan.gradient}
                            />
                            <Pressable onPress={completeOnboarding} style={styles.skipBtn}>
                                <Text style={styles.skipText}>Continue for free  →</Text>
                            </Pressable>
                        </View>

                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // ─── CONTENT SLIDES ──────────────────────────────────────────
    return (
        <View style={styles.container}>
            <StatusBar style="light" />

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
            <SafeAreaView style={styles.bottomNav}>
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
            </SafeAreaView>
        </View>
    );
}

// ─────────────────────────────────────── STYLES ──────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },

    // ── Slides ──────────────────────────────────────────
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
        color: '#fff',
        letterSpacing: -5,
        lineHeight: 76,
    },
    tagline: {
        fontFamily: 'Inter_700Bold',
        fontSize: 38,
        color: '#fff',
        letterSpacing: -2,
        lineHeight: 42,
    },
    welcomeBody: {
        fontSize: 16,
        color: '#a1a1aa',
        lineHeight: 25,
        marginTop: 6,
    },
    floatEmoji: {
        position: 'absolute',
    },

    // Feature slides
    featureContent: {
        gap: 28,
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
        color: '#fff',
        letterSpacing: -1.5,
        lineHeight: 42,
    },
    featureBody: {
        fontSize: 16,
        color: '#a1a1aa',
        lineHeight: 26,
    },

    // ── Bottom nav ──────────────────────────────────────
    bottomNav: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 32,
        paddingBottom: 20,
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
        backgroundColor: '#fff',
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
        borderColor: '#27272a',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    paywallTitle: {
        fontFamily: 'Inter_900Black',
        fontSize: 52,
        color: '#fff',
        letterSpacing: -3,
        lineHeight: 52,
    },
    paywallSubtitle: {
        fontSize: 15,
        color: '#a1a1aa',
        marginTop: 8,
        marginBottom: 24,
    },

    // Plan tabs
    planTabs: {
        flexDirection: 'row',
        backgroundColor: '#111',
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
        backgroundColor: '#fff',
    },
    planTabText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#71717a',
    },
    planTabTextActive: {
        color: '#000',
    },

    // Plan card
    planCard: {
        backgroundColor: '#111',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#27272a',
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
        color: '#fff',
    },
    planTagline: {
        fontSize: 13,
        color: '#71717a',
        marginTop: 2,
    },
    planPrice: {
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
        color: '#fff',
    },
    planDivider: {
        height: 1,
        backgroundColor: '#27272a',
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
        color: '#e4e4e7',
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
        color: '#52525b',
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
        color: '#fff',
        letterSpacing: -3,
        lineHeight: 52,
    },
    profileSubtitle: {
        fontSize: 15,
        color: '#a1a1aa',
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
        backgroundColor: '#111',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLabel: {
        fontSize: 13,
        color: '#a1a1aa',
    },
    fieldGroup: {
        marginBottom: 18,
    },
    fieldLabel: {
        fontFamily: 'Inter_700Bold',
        fontSize: 13,
        color: '#fff',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#111',
        borderWidth: 1,
        borderColor: '#27272a',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: '#fff',
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
