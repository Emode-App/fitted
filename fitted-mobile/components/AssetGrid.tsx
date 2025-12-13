// AssetGrid - Grid of saved clothing items in a folder
// Tap to add to canvas, long-press to delete

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Dimensions,
    Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Asset, useWardrobeStore } from '../stores/wardrobeStore';
import { useTheme } from '@/hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 4;
const ITEM_MARGIN = 6;
// Calculate item size based on full screen width minus padding
const ITEM_SIZE = (SCREEN_WIDTH - 32 - ITEM_MARGIN * (NUM_COLUMNS * 2)) / NUM_COLUMNS;
// Better calculation: (SCREEN_WIDTH - 40 - (NUM_COLUMNS-1)*ITEM_MARGIN) / NUM_COLUMNS

export default function AssetGrid({ onAssetSelect }: { onAssetSelect: (asset: Asset) => void }) {
    const { colors } = useTheme();
    const { folders, selectedFolderId, removeAsset } = useWardrobeStore();

    const selectedFolder = folders.find(f => f.id === selectedFolderId);
    const assets = selectedFolder?.assets || [];

    const handleLongPress = (asset: Asset) => {
        Alert.alert(
            'Remove from Wardrobe?',
            'This will remove the item from this folder.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => removeAsset(selectedFolderId, asset.id),
                },
            ]
        );
    };

    const renderAsset = ({ item }: { item: Asset }) => (
        <TouchableOpacity
            style={[styles.assetItem, { backgroundColor: colors.backgroundSecondary }]}
            onPress={() => onAssetSelect(item)}
            onLongPress={() => handleLongPress(item)}
            activeOpacity={0.8}
        >
            <Image
                source={{ uri: item.url }}
                style={styles.assetImage}
                contentFit="contain" // Contain usually looks better for products
            />
            <View style={[styles.addOverlay, { backgroundColor: colors.primary }]}>
                <Feather name="plus" size={12} color={colors.primaryForeground} />
            </View>
        </TouchableOpacity>
    );

    if (assets.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Feather name="image" size={32} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No items yet</Text>
                <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
                    Items you add will appear here
                </Text>
            </View>
        );
    }

    return (
        <FlatList
            data={assets}
            renderItem={renderAsset}
            keyExtractor={(item) => item.id}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false} // Let parent scroll handle this
        />
    );
}

const styles = StyleSheet.create({
    gridContainer: {
        paddingHorizontal: 0,
        alignItems: 'flex-start',
    },
    assetItem: {
        width: 75, // Approximate
        height: 75,
        margin: ITEM_MARGIN,
        borderRadius: 12,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 4,
    },
    assetImage: {
        width: '100%',
        height: '100%',
    },
    addOverlay: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 24,
        paddingHorizontal: 16,
    },
    emptyText: {
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
        fontFamily: 'Inter_600SemiBold',
    },
    emptySubtext: {
        fontSize: 12,
        marginTop: 4,
        textAlign: 'center',
        fontFamily: 'Inter_400Regular',
    },
});
