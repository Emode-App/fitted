// FolderCarousel - Horizontal scrollable folder tabs
// Allows switching between wardrobe folders and creating new ones

import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Modal,
    Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Folder, useWardrobeStore } from '../stores/wardrobeStore';
import { useTheme } from '@/hooks/useTheme';

interface FolderCarouselProps {
    compact?: boolean;
}

export default function FolderCarousel({ compact = false }: FolderCarouselProps) {
    const { colors } = useTheme();
    const { folders, selectedFolderId, setSelectedFolder, createFolder } = useWardrobeStore();
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const handleCreateFolder = () => {
        if (!newFolderName.trim()) {
            Alert.alert('Error', 'Please enter a folder name');
            return;
        }
        createFolder(newFolderName.trim());
        setNewFolderName('');
        setIsCreatingFolder(false);
    };

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {folders.map((folder) => {
                    const isSelected = selectedFolderId === folder.id;
                    return (
                        <TouchableOpacity
                            key={folder.id}
                            style={[
                                styles.folderTab,
                                { backgroundColor: isSelected ? colors.primary : colors.backgroundSecondary },
                            ]}
                            onPress={() => setSelectedFolder(folder.id)}
                            activeOpacity={0.7}
                        >
                            <Feather name={folder.id === 'last_used' ? 'clock' : 'folder'} size={14} color={isSelected ? colors.primaryForeground : colors.textSecondary} />
                            <Text
                                style={[
                                    styles.folderName,
                                    { color: isSelected ? colors.primaryForeground : colors.text },
                                ]}
                            >
                                {folder.name}
                            </Text>
                            <View
                                style={[
                                    styles.assetCount,
                                    { backgroundColor: isSelected ? 'rgba(0,0,0,0.1)' : colors.backgroundTertiary },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.assetCountText,
                                        { color: isSelected ? colors.primaryForeground : colors.textTertiary },
                                    ]}
                                >
                                    {folder.assets.length}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}

                {/* Add Folder Button */}
                <TouchableOpacity
                    style={[styles.addFolderButton, { borderColor: colors.border }]}
                    onPress={() => setIsCreatingFolder(true)}
                    activeOpacity={0.7}
                >
                    <Feather name="folder-plus" size={16} color={colors.textSecondary} />
                    <Text style={[styles.addFolderText, { color: colors.textSecondary }]}>
                        {compact ? '+' : '+ Folder'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Create Folder Modal */}
            <Modal
                visible={isCreatingFolder}
                transparent
                animationType="fade"
                onRequestClose={() => setIsCreatingFolder(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>New Folder</Text>
                        <TextInput
                            style={[styles.modalInput, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                            placeholder="Folder name..."
                            placeholderTextColor={colors.textTertiary}
                            value={newFolderName}
                            onChangeText={setNewFolderName}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={handleCreateFolder}
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButtonCancel, { backgroundColor: colors.backgroundSecondary }]}
                                onPress={() => {
                                    setNewFolderName('');
                                    setIsCreatingFolder(false);
                                }}
                            >
                                <Text style={[styles.modalButtonCancelText, { color: colors.text }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButtonCreate, { backgroundColor: colors.primary }]}
                                onPress={handleCreateFolder}
                            >
                                <Text style={[styles.modalButtonCreateText, { color: colors.primaryForeground }]}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginVertical: 8,
    },
    scrollContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    folderTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 6,
    },
    folderName: {
        fontSize: 13,
        fontWeight: '600',
        fontFamily: 'Inter_600SemiBold',
    },
    assetCount: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    assetCountText: {
        fontSize: 10,
        fontWeight: '600',
        fontFamily: 'Inter_600SemiBold',
    },
    addFolderButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderRadius: 20,
        borderStyle: 'dashed',
        gap: 4,
    },
    addFolderText: {
        fontSize: 13,
        fontFamily: 'Inter_500Medium',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        borderRadius: 16,
        padding: 20,
        width: '100%',
        maxWidth: 320,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 16,
        textAlign: 'center',
        fontFamily: 'Inter_700Bold',
    },
    modalInput: {
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        marginBottom: 16,
        fontFamily: 'Inter_400Regular',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButtonCancel: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    modalButtonCancelText: {
        fontWeight: '600',
        fontFamily: 'Inter_600SemiBold',
    },
    modalButtonCreate: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    modalButtonCreateText: {
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
});
