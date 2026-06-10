import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Pressable, FlatList,
    Dimensions, SafeAreaView, ScrollView, Alert, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { purchaseSubscription } from '@/services/revenueCatService';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';

const { width: SW } = Dimensions.get('window');
export const ONBOARDING_KEY = 'has_onboarded';

// ─────────────────────────────────────── SLIDE DATA ───

const SLIDES = [
    { id: 'welcome' },
    {
        id: 'fits',
        icon: 'layers',
        title: 'Build Your Fit',
        body: 'Drag and drop pieces onto a canvas. Style mood boards with anything from your wardrobe or the web.',
    },
    {
        id: 'ai',
        icon: 'cpu',
        title: 'Try On Anything',
        body: 'Upload a photo and let AI style you in any outfit — no fitting room, no guesswork.',
    },
    {
        id: 'social',
        icon: 'users',
        title: 'Your Stage',
        body: 'Share fits, discover creators, and build a following around your personal style.',
    },
] as const;

// ─────────────────────────────────────── PLAN DATA ────

const PLANS = [
    {
        id: 'proTryOns' as const,
        label: 'Pro Try-Ons',
        price: '$10/mo',
        tagline: 'For the experimenters',
        icon: 'cpu' as const,
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
        price: '$15/mo',
        tagline: 'For brands & sellers',
        icon: 'shopping-bag' as const,
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
        price: '$25/mo',
        tagline: 'For professional stylists',
        icon: 'star' as const,
        perks: [
            'Verified stylist badge on profile',
            'Appear in stylist discovery',
            'Accept styling requests from users',
            'Set your rate & earn from sessions',
            'Priority placement in suggestions',
        ],
    },
];

// ─────────────────────────────────────── COMPONENT ───

export default function OnboardingScreen() {
    const listRef = useRef<FlatList>(null);
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

    const completeOnboarding = async () => {
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
        router.replace('/(tabs)');
    };

    const handleNext = () => {
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
                        <Text style={styles.profileTitle}>You</Text>
                        <Text style={styles.profileSubtitle}>
                            Add a few personal touches. Everything here is optional — you can edit it anytime in Settings.
                        </Text>

                        <Pressable style={styles.avatarPicker} onPress={pickAvatar}>
                            {avatarUri ? (
                                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Feather name="camera" size={24} color="#71717a" />
                                </View>
                            )}
                            <Text style={styles.avatarLabel}>
                                {avatarUri ? 'Change photo' : 'Add a profile photo'}
                            </Text>
                        </Pressable>

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
                            <Text style={styles.fieldLabel}>Location</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="City, Country"
                                placeholderTextColor="#52525b"
                                value={location}
                                onChangeText={setLocation}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>Favorite Brand</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Carhartt WIP"
                                placeholderTextColor="#52525b"
                                value={favoriteBrand}
                                onChangeText={setFavoriteBrand}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>Favorite Song</Text>
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
                            <Text style={styles.fieldLabel}>Website</Text>
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
                        <Pressable
                            style={[styles.subscribeBtn, savingProfile && { opacity: 0.65 }]}
                            onPress={handleSaveProfile}
                            disabled={savingProfile}
                        >
                            <Text style={styles.subscribeBtnText}>
                                {savingProfile ? 'Saving...' : 'Continue'}
                            </Text>
                        </Pressable>
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
                        <Text style={styles.paywallTitle}>Level Up</Text>
                        <Text style={styles.paywallSubtitle}>Choose the plan that fits your goals</Text>

                        {/* Plan tabs */}
                        <View style={styles.planTabs}>
                            {PLANS.map((p, i) => (
                                <Pressable
                                    key={p.id}
                                    onPress={() => setActivePlan(i)}
                                    style={[styles.planTab, i === activePlan && styles.planTabActive]}
                                >
                                    <Text style={[styles.planTabText, i === activePlan && styles.planTabTextActive]}>
                                        {p.label}
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
                            <View style={styles.planCard}>
                                {/* Card header */}
                                <View style={styles.planCardHead}>
                                    <View style={styles.planIconCircle}>
                                        <Feather name={plan.icon} size={20} color="#fff" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.planName}>{plan.label}</Text>
                                        <Text style={styles.planTagline}>{plan.tagline}</Text>
                                    </View>
                                    <Text style={styles.planPrice}>{plan.price}</Text>
                                </View>

                                <View style={styles.planDivider} />

                                {plan.perks.map((perk, i) => (
                                    <View key={i} style={styles.perkRow}>
                                        <View style={styles.checkCircle}>
                                            <Feather name="check" size={11} color="#000" />
                                        </View>
                                        <Text style={styles.perkText}>{perk}</Text>
                                    </View>
                                ))}
                            </View>
                        </ScrollView>

                        {/* Footer CTA */}
                        <View style={styles.paywallFooter}>
                            <Pressable
                                style={[styles.subscribeBtn, purchasing && { opacity: 0.65 }]}
                                onPress={handleSubscribe}
                                disabled={purchasing}
                            >
                                <Text style={styles.subscribeBtnText}>
                                    {purchasing ? 'Processing...' : `Subscribe · ${plan.price}`}
                                </Text>
                            </Pressable>
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

            <FlatList
                ref={listRef}
                data={SLIDES}
                keyExtractor={item => item.id}
                horizontal
                pagingEnabled
                scrollEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={e => {
                    setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / SW));
                }}
                renderItem={({ item }) => (
                    <View style={styles.slide}>
                        {item.id === 'welcome' ? (
                            <View style={styles.welcomeContent}>
                                <Text style={styles.appName}>emode</Text>
                                <Text style={styles.tagline}>internet{'\n'}fashion.</Text>
                                <Text style={styles.welcomeBody}>
                                    The platform built for fashion-forward creators.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.featureContent}>
                                <View style={styles.featureIconCircle}>
                                    <Feather name={(item as any).icon} size={40} color="#fff" />
                                </View>
                                <Text style={styles.featureTitle}>{(item as any).title}</Text>
                                <Text style={styles.featureBody}>{(item as any).body}</Text>
                            </View>
                        )}
                    </View>
                )}
            />

            {/* Dots + Next */}
            <SafeAreaView style={styles.bottomNav}>
                <View style={styles.dots}>
                    {SLIDES.map((_, i) => (
                        <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
                    ))}
                </View>
                <Pressable style={styles.nextBtn} onPress={handleNext}>
                    <Text style={styles.nextBtnText}>
                        {isLastSlide ? 'See Plans' : 'Next'}
                    </Text>
                    {isLastSlide && (
                        <Feather name="arrow-right" size={16} color="#000" style={{ marginLeft: 6 }} />
                    )}
                </Pressable>
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
        color: '#71717a',
        lineHeight: 25,
        marginTop: 6,
    },

    // Feature slides
    featureContent: {
        gap: 28,
    },
    featureIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 1,
        borderColor: '#27272a',
        alignItems: 'center',
        justifyContent: 'center',
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
        color: '#71717a',
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
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#27272a',
    },
    dotActive: {
        backgroundColor: '#fff',
        width: 20,
    },
    nextBtn: {
        backgroundColor: '#fff',
        borderRadius: 14,
        paddingVertical: 17,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    nextBtnText: {
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
        color: '#000',
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
        color: '#71717a',
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
        backgroundColor: '#1f1f1f',
        borderWidth: 1,
        borderColor: '#3f3f46',
        alignItems: 'center',
        justifyContent: 'center',
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
        backgroundColor: '#22c55e',
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
    subscribeBtn: {
        backgroundColor: '#fff',
        borderRadius: 14,
        paddingVertical: 18,
        alignItems: 'center',
    },
    subscribeBtnText: {
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
        color: '#000',
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
        color: '#71717a',
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
    avatarPlaceholder: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: '#111',
        borderWidth: 1,
        borderColor: '#27272a',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLabel: {
        fontSize: 13,
        color: '#71717a',
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
