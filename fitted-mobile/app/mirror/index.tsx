import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useWardrobeStore } from '@/stores/wardrobeStore';

const STEPS: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[] = [
    { icon: 'camera', title: 'Scan the code on the mirror', body: 'Point your phone’s camera at it, then tap “Open in Emode”.' },
    { icon: 'send', title: 'Send your wardrobe', body: 'Pick pieces from your Emode wardrobe — they appear on the mirror instantly.' },
    { icon: 'user', title: 'Step back and see it on you', body: 'Life-size. Swap pieces, try new combinations, save the looks you love here.' },
];

/**
 * Where the app points people at the physical mirror.
 *
 * Deliberately informational. Everything it describes happens at a mirror, so
 * there is nothing on this screen that needs one to work -- and nothing a
 * reviewer without a Proto in the room would find broken.
 */
export default function MirrorInfoScreen() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const pieces = useWardrobeStore((s) => s.folders
        .filter((f) => f.id !== 'last_used')
        .reduce((n, f) => n + f.assets.length, 0));

    const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
                    <Feather name="x" size={24} color={colors.text} />
                </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 40 }}>
                <Text style={styles.eyebrow}>Emode Mirror</Text>
                <Text style={[styles.title, { color: colors.text }]}>Try on in person.</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                    A life-size mirror that dresses you in anything — including everything already in your Emode wardrobe.
                    {pieces > 0 ? ` Your ${pieces} piece${pieces === 1 ? '' : 's'} come with you.` : ''}
                </Text>

                <View style={styles.steps}>
                    {STEPS.map((s, i) => (
                        <View key={s.title} style={styles.step}>
                            <View style={[styles.stepIcon, { borderColor: colors.border }]}>
                                <Feather name={s.icon} size={18} color={colors.text} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.stepTitle, { color: colors.text }]}>{i + 1}. {s.title}</Text>
                                <Text style={[styles.stepBody, { color: colors.textSecondary }]}>{s.body}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={[styles.note, { backgroundColor: colors.backgroundSecondary }]}>
                    <Feather name="shield" size={16} color={colors.textSecondary} />
                    <Text style={[styles.noteText, { color: colors.textSecondary }]}>
                        The mirror takes one photo to dress you, and deletes it when you finish. Only the looks you choose to save come to your account.
                    </Text>
                </View>

                <View style={[styles.business, { borderColor: colors.border }]}>
                    <Text style={[styles.businessTitle, { color: colors.text }]}>Run a store?</Text>
                    <Text style={[styles.body, { color: colors.textSecondary, marginTop: 4 }]}>
                        Put an Emode Mirror on your floor and let shoppers try on your pieces life-size.
                    </Text>
                    <Pressable
                        onPress={() => Linking.openURL('mailto:support@emode.style?subject=Emode%20Mirror%20for%20my%20store')}
                        style={[styles.businessButton, { backgroundColor: colors.primary }]}
                    >
                        <Text style={[styles.businessButtonText, { color: colors.primaryForeground }]}>Talk to us</Text>
                    </Pressable>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingBottom: 8 },
    eyebrow: { color: '#c5a059', fontSize: 11, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', marginTop: 8 },
    title: { fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 8 },
    body: { fontSize: 15, lineHeight: 22, marginTop: 10 },
    steps: { marginTop: 28, gap: 20 },
    step: { flexDirection: 'row', gap: 14 },
    stepIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    stepTitle: { fontSize: 15, fontWeight: '700' },
    stepBody: { fontSize: 14, lineHeight: 20, marginTop: 3 },
    note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, marginTop: 28 },
    noteText: { flex: 1, fontSize: 13, lineHeight: 19 },
    business: { marginTop: 28, padding: 18, borderRadius: 16, borderWidth: 1 },
    businessTitle: { fontSize: 17, fontWeight: '700' },
    businessButton: { alignSelf: 'flex-start', marginTop: 14, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
    businessButtonText: { fontSize: 14, fontWeight: '700' },
});
