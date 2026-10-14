import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { mirror, takePendingMirrorRoute, type MirrorVisit } from '@/services/mirror';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TILE = (SCREEN_WIDTH - 40 - 16) / 3;

/**
 * A mirror visit, opened from the mirror's QR page with "Open in Emode".
 *
 * The visit is claimed for this account on arrival, which is what lets the
 * mirror accept pieces from the wardrobe and lets finished looks be saved here.
 * The visitor's photo never comes to the phone -- only the finished looks do.
 */
export default function MirrorVisitScreen() {
    const { sessionId, t } = useLocalSearchParams<{ sessionId: string; t: string }>();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const folders = useWardrobeStore((s) => s.folders);

    const [visit, setVisit] = useState<MirrorVisit | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [folderId, setFolderId] = useState<string | null>(null);
    const [picked, setPicked] = useState<string[]>([]);
    const [sentUrls, setSentUrls] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const [savedLooks, setSavedLooks] = useState<string[]>([]);
    const [savingLook, setSavingLook] = useState<string | null>(null);

    // Arriving here is the trip the sign-in gate was holding open; done with it.
    useEffect(() => { takePendingMirrorRoute(); }, []);

    useEffect(() => {
        if (!sessionId || !t) {
            setFailure('This mirror link is incomplete. Scan the code on the mirror again.');
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                await mirror.link(sessionId, t);
                const v = await mirror.state(sessionId, t);
                if (!cancelled) setVisit(v);
            } catch (e) {
                if (!cancelled) setFailure((e as Error).message);
            }
        })();
        return () => { cancelled = true; };
    }, [sessionId, t]);

    const connected = !!visit;
    useFocusEffect(useCallback(() => {
        if (!connected || !sessionId || !t) return;
        const id = setInterval(() => {
            mirror.state(sessionId, t).then(setVisit).catch(() => {});
        }, 3000);
        return () => clearInterval(id);
    }, [connected, sessionId, t]));

    // Only pieces the server can actually reach. Items saved as file:// paths
    // only ever lived on the phone that picked them.
    const usableFolders = useMemo(() => folders
        .map((f) => ({ ...f, assets: f.assets.filter((a) => /^https?:\/\//i.test(a.url)) }))
        .filter((f) => f.assets.length > 0), [folders]);
    const folder = usableFolders.find((f) => f.id === folderId) ?? usableFolders[0];

    const active = visit?.status === 'active';
    const room = visit ? visit.limits.garmentsPerSession - visit.garments.length : 0;
    const looks = (visit?.looks ?? []).filter((l) => l.status === 'succeeded' && l.imageUrl).reverse();
    const styling = (visit?.looks ?? []).some((l) => l.status === 'pending');

    const toggle = (url: string) => {
        Haptics.selectionAsync();
        setPicked((p) => {
            if (p.includes(url)) return p.filter((u) => u !== url);
            if (p.length >= room) {
                Alert.alert('The mirror is full', `It holds ${visit?.limits.garmentsPerSession} pieces at a time. Remove one from the mirror to add another.`);
                return p;
            }
            return [...p, url];
        });
    };

    const send = async () => {
        if (!picked.length || !sessionId || !t) return;
        setSending(true);
        try {
            const r = await mirror.sendFromWardrobe(sessionId, t, picked);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSentUrls((s) => [...s, ...picked]);
            setPicked([]);
            if (r.skipped.length) {
                Alert.alert(
                    r.added ? `Sent ${r.added}` : 'Nothing sent',
                    `These couldn't be sent:\n• ${r.skipped.join('\n• ')}`,
                );
            }
            setVisit(await mirror.state(sessionId, t));
        } catch (e) {
            Alert.alert('Could not send', (e as Error).message);
        } finally {
            setSending(false);
        }
    };

    const removeFromMirror = async (garmentId: string) => {
        if (!sessionId || !t) return;
        try {
            await mirror.removeGarment(sessionId, t, garmentId);
            setVisit(await mirror.state(sessionId, t));
        } catch (e) {
            Alert.alert('Could not remove', (e as Error).message);
        }
    };

    const saveLook = async (lookId: string) => {
        if (!sessionId || !t) return;
        setSavingLook(lookId);
        try {
            await mirror.saveLook(sessionId, t, lookId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSavedLooks((s) => [...s, lookId]);
        } catch (e) {
            Alert.alert('Could not save', (e as Error).message);
        } finally {
            setSavingLook(null);
        }
    };

    const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

    // ── render ────────────────────────────────────────────────────────────
    const header = (
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
            <Pressable onPress={close} hitSlop={12} style={styles.headerButton} accessibilityLabel="Close">
                <Feather name="x" size={24} color={colors.text} />
            </Pressable>
            <View style={{ alignItems: 'center' }}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Emode Mirror</Text>
                {!!visit?.device.name && (
                    <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {visit.device.location || visit.device.name}
                    </Text>
                )}
            </View>
            <View style={styles.headerButton} />
        </View>
    );

    if (failure) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                {header}
                <View style={styles.centered}>
                    <Feather name="wifi-off" size={36} color={colors.textSecondary} />
                    <Text style={[styles.centeredTitle, { color: colors.text }]}>{failure}</Text>
                    <Pressable onPress={close} style={[styles.primary, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Back to Emode</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    if (!visit) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                {header}
                <View style={styles.centered}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={[styles.centeredBody, { color: colors.textSecondary }]}>Connecting to the mirror…</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {header}
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + (picked.length ? 110 : 40) }}>
                {active ? (
                    <>
                        <Text style={[styles.eyebrow, { color: '#c5a059' }]}>Connected</Text>
                        <Text style={[styles.title, { color: colors.text }]}>Send your wardrobe to the mirror.</Text>
                        <Text style={[styles.body, { color: colors.textSecondary }]}>
                            Pick pieces below. They appear on the mirror right away — then step back and try them on.
                        </Text>
                    </>
                ) : (
                    <>
                        <Text style={[styles.eyebrow, { color: '#c5a059' }]}>Visit ended</Text>
                        <Text style={[styles.title, { color: colors.text }]}>Keep the looks you love.</Text>
                        <Text style={[styles.body, { color: colors.textSecondary }]}>
                            Your photo was deleted when the visit ended. Save any look below to your try-ons
                            {visit.retainUntil ? ` before ${new Date(visit.retainUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}.
                        </Text>
                    </>
                )}

                {styling && (
                    <View style={[styles.notice, { backgroundColor: colors.backgroundSecondary }]}>
                        <ActivityIndicator size="small" color={colors.text} />
                        <Text style={[styles.noticeText, { color: colors.text }]}>The mirror is styling a look…</Text>
                    </View>
                )}

                {looks.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Your looks</Text>
                        {looks.map((look, i) => {
                            const saved = savedLooks.includes(look.id);
                            return (
                                <View key={look.id} style={[styles.lookCard, { backgroundColor: colors.backgroundSecondary }]}>
                                    <Image source={{ uri: look.imageUrl! }} style={styles.lookImage} contentFit="contain" />
                                    <View style={styles.lookFooter}>
                                        <Text style={[styles.lookLabel, { color: colors.text }]}>Look {looks.length - i}</Text>
                                        <Pressable
                                            disabled={saved || savingLook === look.id}
                                            onPress={() => saveLook(look.id)}
                                            style={[styles.saveButton, saved
                                                ? { borderColor: colors.border, borderWidth: 1 }
                                                : { backgroundColor: colors.primary }]}
                                        >
                                            {savingLook === look.id ? (
                                                <ActivityIndicator size="small" color={colors.primaryForeground} />
                                            ) : (
                                                <Text style={[styles.saveText, { color: saved ? colors.textSecondary : colors.primaryForeground }]}>
                                                    {saved ? 'Saved to try-ons ✓' : 'Save to my try-ons'}
                                                </Text>
                                            )}
                                        </Pressable>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {active && visit.garments.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>
                            On the mirror · {visit.garments.length} of {visit.limits.garmentsPerSession}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                            {visit.garments.map((g) => (
                                <View key={g.id} style={[styles.onMirror, { backgroundColor: '#fff', borderColor: colors.border }]}>
                                    {g.imageUrl && <Image source={{ uri: g.imageUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />}
                                    <Pressable onPress={() => removeFromMirror(g.id)} hitSlop={8} style={styles.removeDot} accessibilityLabel="Take off the mirror">
                                        <Feather name="x" size={12} color="#fff" />
                                    </Pressable>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {active && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>From your wardrobe</Text>
                        {usableFolders.length === 0 ? (
                            <Text style={[styles.body, { color: colors.textSecondary }]}>
                                Your wardrobe is empty. Add pieces in Create, or send screenshots from the mirror&apos;s web page.
                            </Text>
                        ) : (
                            <>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                                    {usableFolders.map((f) => {
                                        const on = f.id === folder?.id;
                                        return (
                                            <Pressable key={f.id} onPress={() => setFolderId(f.id)}
                                                style={[styles.chip, on ? { backgroundColor: colors.text } : { borderColor: colors.border, borderWidth: 1 }]}>
                                                <Text style={[styles.chipText, { color: on ? colors.background : colors.text }]}>
                                                    {f.id === 'last_used' ? 'Recent' : f.name} {f.assets.length}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                                <View style={styles.grid}>
                                    {folder?.assets.map((a) => {
                                        const index = picked.indexOf(a.url);
                                        const sent = sentUrls.includes(a.url);
                                        return (
                                            <Pressable key={a.id} onPress={() => toggle(a.url)}
                                                style={[styles.tile, { backgroundColor: '#fff', borderColor: index >= 0 ? '#c5a059' : colors.border, borderWidth: index >= 0 ? 2 : 1 }]}>
                                                <Image source={{ uri: a.url }} style={StyleSheet.absoluteFill} contentFit="contain" />
                                                {index >= 0 && (
                                                    <View style={styles.pickBadge}><Text style={styles.pickBadgeText}>{index + 1}</Text></View>
                                                )}
                                                {sent && index < 0 && (
                                                    <View style={[styles.sentBadge, { backgroundColor: colors.text }]}>
                                                        <Feather name="check" size={10} color={colors.background} />
                                                    </View>
                                                )}
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </>
                        )}
                    </View>
                )}
            </ScrollView>

            {active && picked.length > 0 && (
                <View style={[styles.sendBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    <Pressable disabled={sending} onPress={send} style={[styles.primary, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}>
                        {sending ? (
                            <ActivityIndicator color={colors.primaryForeground} />
                        ) : (
                            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>
                                Send {picked.length} to the mirror
                            </Text>
                        )}
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerButton: { width: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700' },
    headerSub: { fontSize: 12, marginTop: 2, maxWidth: 220 },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
    centeredTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
    centeredBody: { fontSize: 14 },

    eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase' },
    title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 6 },
    body: { fontSize: 14, lineHeight: 20, marginTop: 8 },

    notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, marginTop: 18 },
    noticeText: { fontSize: 14, fontWeight: '600' },

    section: { marginTop: 28 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },

    lookCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
    lookImage: { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#000' },
    lookFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
    lookLabel: { fontSize: 15, fontWeight: '700' },
    saveButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, minWidth: 150, alignItems: 'center' },
    saveText: { fontSize: 13, fontWeight: '700' },

    onMirror: { width: 64, height: 80, borderRadius: 10, overflow: 'hidden', borderWidth: 1 },
    removeDot: {
        position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
    },

    chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { fontSize: 13, fontWeight: '600' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: { width: TILE, height: TILE * 1.25, borderRadius: 12, overflow: 'hidden' },
    pickBadge: {
        position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#c5a059', alignItems: 'center', justifyContent: 'center',
    },
    pickBadgeText: { color: '#0a0a0a', fontSize: 12, fontWeight: '800' },
    sentBadge: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

    sendBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    primary: { borderRadius: 999, height: 52, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontSize: 16, fontWeight: '700' },
});
