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
    Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Asset, useWardrobeStore } from '../stores/wardrobeStore';
import { useTheme } from '@/hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 4;
const CONTAINER_PADDING = 16;
const GAP = 12;
// Calculate item size: container width minus padding and gaps divided by columns
const CONTAINER_WIDTH = SCREEN_WIDTH - 32; // margin from parent
const ITEM_SIZE = (CONTAINER_WIDTH - (CONTAINER_PADDING * 2) - (GAP * (NUM_COLUMNS - 1))) / NUM_COLUMNS;

export default function AssetGrid({ onAssetSelect }: { onAssetSelect: (asset: Asset) => void }) {
    const { colors, isDark } = useTheme();
    const { folders, selectedFolderId, removeAsset, addAsset } = useWardrobeStore();

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

    const handleAddToFolder = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const newAsset: Asset = {
                id: Math.random().toString(36).substring(7),
                url: result.assets[0].uri,
                dateAdded: Date.now(),
            };
            addAsset(selectedFolderId, newAsset);
        }
    };

    const renderAsset = ({ item }: { item: Asset }) => (
        <TouchableOpacity
            style={[
                styles.assetItem,
                { backgroundColor: isDark ? '#000' : '#fff' },
            ]}
            onPress={() => onAssetSelect(item)}
            onLongPress={() => handleLongPress(item)}
            activeOpacity={0.8}
        >
            <Image
                source={{ uri: item.url }}
                style={styles.assetImage}
                contentFit="contain"
            />
            <View style={[styles.addOverlay, { backgroundColor: colors.primary }]}>
                <Feather name="plus" size={12} color="#fff" />
            </View>
        </TouchableOpacity>
    );

    // Empty state with dashed border
    const renderEmpty = () => (
        <View style={[styles.emptyState, isDark && { borderColor: '#3f3f46' }]}>
            <Feather name="image" size={24} color="#9ca3af" style={{ opacity: 0.5 }} />
            <Text style={styles.emptyText}>No items yet</Text>
        </View>
    );

    return (
        <View style={[styles.container, isDark && { backgroundColor: '#18181b' }]}>
            {/* Header Row */}
            <View style={styles.headerRow}>
                <Text style={[styles.headerLabel, isDark && { color: '#71717a' }]}>
                    {selectedFolder?.name?.toUpperCase()} ASSETS
                </Text>
                <Pressable style={styles.addButton} onPress={handleAddToFolder}>
                    <Feather name="plus" size={14} color={isDark ? '#fff' : '#000'} />
                    <Text style={[styles.addButtonText, isDark && { color: '#fff' }]}>
                        Add to {selectedFolder?.name}
                    </Text>
                </Pressable>
            </View>

            {/* Assets Grid or Empty State */}
            {assets.length === 0 ? (
                renderEmpty()
            ) : (
                <FlatList
                    data={assets}
                    renderItem={renderAsset}
                    keyExtractor={(item) => item.id}
                    numColumns={NUM_COLUMNS}
                    contentContainerStyle={styles.gridContainer}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={false}
                    columnWrapperStyle={styles.columnWrapper}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#f9fafb',
        borderRadius: 16,
        padding: CONTAINER_PADDING,
        marginHorizontal: 16,
        marginTop: 8,
        minHeight: 200,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#9ca3af',
        letterSpacing: 0.5,
        fontFamily: 'Inter_700Bold',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    addButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#000',
        fontFamily: 'Inter_700Bold',
    },
    gridContainer: {
        gap: GAP,
    },
    columnWrapper: {
        gap: GAP,
    },
    assetItem: {
        width: ITEM_SIZE,
        height: ITEM_SIZE,
        borderRadius: 12,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
        borderWidth: 1,
        borderColor: '#f3f4f6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
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
    emptyState: {
        flex: 1,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: '#e5e7eb',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 12,
        color: '#9ca3af',
        marginTop: 8,
        fontFamily: 'Inter_400Regular',
    },
});
