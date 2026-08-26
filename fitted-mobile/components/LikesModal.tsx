import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, Text, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { supabase } from '@/services/supabase';
import { useTheme } from '@/hooks/useTheme';

interface Liker {
    id: string;
    username?: string;
    handle?: string;
    avatar_url?: string;
}

interface LikesModalProps {
    visible: boolean;
    postId: string | null;
    onClose: () => void;
}

/**
 * Who liked a post.
 *
 * The count was the only thing on screen, and a count is the least interesting
 * part -- the point of a flame is which people gave it.
 *
 * The list is not filtered here. The SELECT policy on likes already hides rows
 * either way of a block, so somebody blocked is absent rather than listed and
 * then removed on screen.
 */
export default function LikesModal({ visible, postId, onClose }: LikesModalProps) {
    const { colors } = useTheme();
    const [likers, setLikers] = useState<Liker[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!visible || !postId) return;
        let cancelled = false;
        setLoading(true);

        (async () => {
            const { data, error } = await supabase
                .from('likes')
                .select('created_at, user:users!likes_user_id_fkey(id, username, handle, avatar_url)')
                .eq('post_id', postId)
                .order('created_at', { ascending: false });

            if (cancelled) return;
            if (error) console.warn('Could not load likes:', error.message);

            setLikers(((data ?? []) as any[]).map((row) => row.user).filter(Boolean));
            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [visible, postId]);

    const openProfile = (userId: string) => {
        onClose();
        router.push({ pathname: '/user/[id]', params: { id: userId } });
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                {/* Sibling backdrop rather than a wrapper, so the list scrolls.
                    A pressable ancestor takes the touch responder as soon as a
                    drag starts, which is what stopped the tagged-items sheet
                    swiping. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <View style={[styles.sheet, { backgroundColor: colors.background }]}>
                    <View style={styles.grabber} />
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>Flames</Text>
                        <Pressable onPress={onClose} hitSlop={12}>
                            <Feather name="x" size={22} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    {loading ? (
                        <View style={styles.centred}>
                            <ActivityIndicator color={colors.text} />
                        </View>
                    ) : likers.length === 0 ? (
                        <View style={styles.centred}>
                            <Text style={{ color: colors.textSecondary }}>No flames yet</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={likers}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ paddingBottom: 24 }}
                            renderItem={({ item }) => (
                                <Pressable style={styles.row} onPress={() => openProfile(item.id)}>
                                    {item.avatar_url ? (
                                        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                                    ) : (
                                        <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: colors.backgroundSecondary }]}>
                                            <Feather name="user" size={16} color={colors.textTertiary} />
                                        </View>
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                                            {item.username || 'User'}
                                        </Text>
                                        {item.handle ? (
                                            <Text style={[styles.handle, { color: colors.textSecondary }]} numberOfLines={1}>
                                                {item.handle}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                                </Pressable>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        maxHeight: '70%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 8,
    },
    grabber: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(128,128,128,0.4)',
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingBottom: 12,
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
    },
    centred: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 18,
        paddingVertical: 10,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    avatarEmpty: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: {
        fontSize: 15,
        fontWeight: '600',
    },
    handle: {
        fontSize: 13,
        marginTop: 1,
    },
});
