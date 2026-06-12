import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/services/supabase';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const GAP = 1; // tight gap
const ITEM_WIDTH = (width - (COLUMN_COUNT - 1) * GAP) / COLUMN_COUNT;

export default function TrendDetailScreen() {
    // `id`/`name` are the brand name; `logo` is the brand logo URL (may be empty).
    const { id, name, logo } = useLocalSearchParams<{ id: string; name: string; logo: string }>();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const brandName = name || id || 'Brand';

    useEffect(() => {
        fetchBrandFits();
    }, [id]);

    const fetchBrandFits = async () => {
        try {
            // Pull the most-liked fits, then keep the ones that feature this brand.
            // Brand names are free-text in items[], so we match case-insensitively
            // client-side rather than with a fragile JSONB containment query.
            // Note: no users join here — posts<->users is ambiguous (direct FK +
            // many-to-many via likes), which makes PostgREST error out. The grid
            // only needs id + generated_image anyway.
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .order('likes_count', { ascending: false })
                .limit(200);

            if (error) console.error('Failed to fetch brand fits:', error);

            if (data) {
                const target = brandName.trim().toLowerCase();
                const matches = data.filter((post: any) =>
                    Array.isArray(post.items) &&
                    post.items.some((item: any) => item?.brand?.trim().toLowerCase() === target)
                );
                setPosts(matches);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const renderHeader = () => (
        <View style={[styles.header, { backgroundColor: colors.background }]}>
            <Pressable onPress={() => router.back()} style={styles.iconButton}>
                <Feather name="arrow-left" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {brandName}
            </Text>
            <Pressable style={styles.iconButton}>
                <Feather name="filter" size={24} color={colors.text} />
            </Pressable>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Use Stack.Screen to configure/hide default header since we use a custom one */}
            <Stack.Screen options={{ headerShown: false }} />

            {renderHeader()}

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Hero Section — brand logo on a neutral surface */}
                <View style={[styles.heroContainer, { backgroundColor: isDark ? '#18181b' : '#f4f4f5' }]}>
                    {logo ? (
                        <Image source={{ uri: logo }} style={styles.heroLogo} contentFit="contain" />
                    ) : (
                        <Text style={[styles.heroTitle, { color: colors.text }]}>{brandName}</Text>
                    )}
                </View>

                {/* Description */}
                <View style={[styles.descriptionContainer, { backgroundColor: colors.background }]}>
                    <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                        The most-liked fits featuring <Text style={{ color: colors.text, fontWeight: '700' }}>{brandName}</Text> on Emode.
                    </Text>
                </View>

                {/* Grid */}
                {loading ? (
                    <View style={{ padding: 40 }}>
                        <ActivityIndicator color={colors.text} />
                    </View>
                ) : posts.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Feather name="grid" size={32} color={colors.textTertiary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            No fits featuring {brandName} yet.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.grid}>
                        {posts.map((post) => (
                            <Pressable
                                key={post.id}
                                style={styles.gridItem}
                                onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
                            >
                                <Image
                                    source={{ uri: post.generated_image }}
                                    style={StyleSheet.absoluteFill}
                                    contentFit="cover"
                                />
                            </Pressable>
                        ))}
                    </View>
                )}

                {/* Bottom padding */}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60, // Safe area top approx
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0,0,0,0.1)',
        zIndex: 10,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
        textAlign: 'center',
    },
    iconButton: {
        padding: 4,
    },
    heroContainer: {
        height: 200,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    heroLogo: {
        width: '55%',
        height: '55%',
    },
    heroTitle: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: 1,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    descriptionContainer: {
        padding: 20,
        paddingBottom: 24,
    },
    descriptionText: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: GAP,
    },
    gridItem: {
        width: ITEM_WIDTH,
        height: ITEM_WIDTH * 1.25, // 4:5 aspect ratio looks good for fashion
        backgroundColor: '#e5e7eb',
        position: 'relative',
    },
    emptyState: {
        paddingVertical: 60,
        paddingHorizontal: 40,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: {
        fontSize: 15,
        textAlign: 'center',
    },
});
