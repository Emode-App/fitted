import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/services/supabase';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const GAP = 1; // tight gap
const ITEM_WIDTH = (width - (COLUMN_COUNT - 1) * GAP) / COLUMN_COUNT;

export default function TrendDetailScreen() {
    const { id, name, image } = useLocalSearchParams<{ id: string; name: string; image: string }>();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTrendPosts();
    }, [id]);

    const fetchTrendPosts = async () => {
        try {
            // For now, fetch random posts to populate the grid
            // In a real app, this would filter by the trend tag/category
            const { data, error } = await supabase
                .from('posts')
                .select('*, user:users(*)')
                .limit(21); // Multiple of 3

            if (data) {
                setPosts(data);
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
                {name}
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
                {/* Hero Section */}
                <View style={styles.heroContainer}>
                    <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <View style={styles.heroOverlay}>
                        <Text style={styles.heroTitle}>{name}</Text>
                    </View>
                </View>

                {/* Description */}
                <View style={[styles.descriptionContainer, { backgroundColor: colors.background }]}>
                    <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                        Explore the latest looks defining the <Text style={{ color: colors.text, fontWeight: '700' }}>{name}</Text> aesthetic, curated by the Fitted community.
                    </Text>
                </View>

                {/* Grid */}
                {loading ? (
                    <View style={{ padding: 40 }}>
                        <ActivityIndicator color={colors.text} />
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
                                    source={{ uri: post.image_url }}
                                    style={StyleSheet.absoluteFill}
                                    contentFit="cover"
                                />
                                {post.type === 'video' && (
                                    <View style={styles.videoIcon}>
                                        <Feather name="play" size={12} color="white" />
                                    </View>
                                )}
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
        height: 250,
        width: '100%',
        position: 'relative',
    },
    heroOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    heroTitle: {
        color: 'white',
        fontSize: 32,
        fontWeight: '900',
        textTransform: 'uppercase',
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
    videoIcon: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
    }
});
