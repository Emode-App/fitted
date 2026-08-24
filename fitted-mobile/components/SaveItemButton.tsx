// The heart on a piece.
//
// One component for every surface that shows an item -- a brand's grid, a post's
// "More from" carousel, the item sheet -- so the hearts cannot drift apart in
// look or behaviour.

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useAuthStore } from '@/stores/authStore';
import { useSavedItemsStore } from '@/stores/savedItemsStore';
import { savedItemKey, type SaveableItem } from '@/services/savedItems';

interface SaveItemButtonProps {
    item: SaveableItem;
    /** `overlay` floats on the image; `inline` sits in a row of controls. */
    variant?: 'overlay' | 'inline';
    size?: number;
}

export default function SaveItemButton({ item, variant = 'overlay', size = 18 }: SaveItemButtonProps) {
    const user = useAuthStore((state) => state.user);
    const toggle = useSavedItemsStore((state) => state.toggle);
    // Subscribe to the key set rather than calling isSaved(), so this re-renders
    // when the same piece is saved from another screen.
    const keys = useSavedItemsStore((state) => state.keys);

    // Nothing to save against without an account, and an inert heart is worse
    // than no heart.
    if (!user?.id) return null;

    const saved = keys.has(savedItemKey(item));

    const onPress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        toggle(user.id, item);
    };

    return (
        <Pressable
            onPress={onPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved items' : 'Save item'}
            style={variant === 'overlay' ? styles.overlay : undefined}
        >
            <View style={variant === 'overlay' ? styles.overlayInner : undefined}>
                <Ionicons
                    name={saved ? 'heart' : 'heart-outline'}
                    size={size}
                    color={saved ? '#ff3b5c' : variant === 'overlay' ? '#ffffff' : '#8e8e93'}
                />
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 2,
    },
    overlayInner: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        // Product shots are mostly white, so an unfilled white heart needs
        // something behind it to stay visible.
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
});
