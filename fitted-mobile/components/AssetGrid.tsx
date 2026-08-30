// AssetGrid - Grid of saved clothing items in a folder
// Tap to add to canvas, long-press to file it elsewhere or remove it

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Alert,
    Modal,
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
const MAX_ROWS = 4;
// Header (~30) + 4 rows of items + 3 inter-row gaps
const GRID_MAX_HEIGHT = 30 + (MAX_ROWS * ITEM_SIZE) + ((MAX_ROWS - 1) * GAP) + CONTAINER_PADDING;

export default function AssetGrid({ onAssetSelect }: { onAssetSelect: (asset: Asset) => void }) {
    const { colors, isDark } = useTheme();
    const { folders, selectedFolderId, removeAsset, addAsset, moveAssetToFolder } = useWardrobeStore();

    const selectedFolder = folders.find(f => f.id === selectedFolderId);
    const assets = selectedFolder?.assets || [];

    // The item a long-press is asking about. Held rather than passed straight
    // to the sheet because the choice of folder happens a tap later.
    const [movingAsset, setMovingAsset] = useState<Asset | null>(null);

    // Everywhere it could go. Last Used is excluded as a destination: it fills
    // itself from every add, so choosing it would be a no-op dressed up as an
    // action.
    const destinations = folders.filter(f => f.id !== selectedFolderId && f.id !== 'last_used');

    const handleLongPress = (asset: Asset) => {
        const buttons: any[] = [{ text: 'Cancel', style: 'cancel' }];

        if (destinations.length > 0) {
            buttons.push({ text: 'Move to Folder…', onPress: () => setMovingAsset(asset) });
        }

        buttons.push({
            text: 'Remove',
            style: 'destructive',
            onPress: () => removeAsset(selectedFolderId, asset.id),
        });

        Alert.alert(
            asset.itemName || asset.name || 'This item',
            `In ${selectedFolder?.name ?? 'this folder'}.`,
            buttons,
        );
    };

    const handleMoveTo = (folderId: string, folderName: string) => {
        if (!movingAsset) return;
        moveAssetToFolder(movingAsset.id, selectedFolderId, folderId);
        setMovingAsset(null);
        // Say which way it went, because out of Last Used the item stays put and
        // an unchanged grid otherwise looks like the tap did nothing.
        Alert.alert(
            'Filed',
            selectedFolderId === 'last_used'
                ? `Added to ${folderName}. It stays in Last Used too.`
                : `Moved to ${folderName}.`,
        );
    };

    const handleAddToFolder = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            result.assets.forEach((asset) => {
                const newAsset: Asset = {
                    id: Math.random().toString(36).substring(7),
                    url: asset.uri,
                    dateAdded: Date.now(),
                };
                addAsset(selectedFolderId, newAsset);
            });
        }
    };

    const renderAsset = (item: Asset) => (
        <TouchableOpacity
            key={item.id}
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

    const renderFolderPicker = () => (
        <Modal
            visible={!!movingAsset}
            transparent
            animationType="fade"
            onRequestClose={() => setMovingAsset(null)}
        >
            <Pressable style={styles.pickerBackdrop} onPress={() => setMovingAsset(null)}>
                {/* Stops a tap inside the sheet from closing it, without making
                    the sheet itself a button. */}
                <Pressable
                    style={[styles.pickerSheet, { backgroundColor: isDark ? '#18181b' : '#fff' }]}
                    onPress={() => {}}
                >
                    <Text style={[styles.pickerTitle, { color: isDark ? '#fff' : '#000' }]}>
                        Move to folder
                    </Text>
                    <ScrollView style={{ maxHeight: 320 }}>
                        {destinations.map((folder) => (
                            <Pressable
                                key={folder.id}
                                style={styles.pickerRow}
                                onPress={() => handleMoveTo(folder.id, folder.name)}
                            >
                                <Feather name="folder" size={18} color={colors.textSecondary} />
                                <Text style={[styles.pickerRowText, { color: isDark ? '#fff' : '#000' }]}>
                                    {folder.name}
                                </Text>
                                <Text style={[styles.pickerCount, { color: colors.textTertiary }]}>
                                    {folder.assets.length}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                    <Pressable style={styles.pickerCancel} onPress={() => setMovingAsset(null)}>
                        <Text style={[styles.pickerCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
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
            {renderFolderPicker()}

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

            {/* Assets Grid or Empty State.
                A FlatList here would be a VirtualizedList nested inside the create
                screen's vertical ScrollView: React Native warns about it because
                windowing breaks, and `nestedScrollEnabled` is Android-only so iOS
                got nothing from it anyway. The box is capped at four rows, so a
                wrapped ScrollView renders the same thing without the broken
                virtualization. If folders ever grow large enough for this to cost
                anything, the fix is paging the folder, not re-nesting a FlatList. */}
            {assets.length === 0 ? (
                renderEmpty()
            ) : (
                <ScrollView
                    style={{ maxHeight: GRID_MAX_HEIGHT }}
                    contentContainerStyle={styles.gridContainer}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                >
                    <View style={styles.gridRows}>
                        {assets.map(renderAsset)}
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    pickerBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    pickerSheet: {
        width: '100%',
        borderRadius: 18,
        paddingTop: 18,
        paddingBottom: 8,
        overflow: 'hidden',
    },
    pickerTitle: {
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 12,
    },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    pickerRowText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
    },
    pickerCount: {
        fontSize: 13,
    },
    pickerCancel: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    pickerCancelText: {
        fontSize: 15,
        fontWeight: '600',
    },
    container: {
        backgroundColor: '#f9fafb',
        borderRadius: 16,
        padding: CONTAINER_PADDING,
        marginHorizontal: 16,
        marginTop: 8,
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
    // Wraps into NUM_COLUMNS columns because assetItem is a fixed ITEM_SIZE that
    // was derived from the container width and gaps.
    gridRows: {
        flexDirection: 'row',
        flexWrap: 'wrap',
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
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
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
