// FolderCarousel - Horizontal scrollable folder tabs
// Allows switching between wardrobe folders and creating new ones

import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Modal,
    Alert,
    Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Folder, useWardrobeStore } from '../stores/wardrobeStore';
import { useTheme } from '@/hooks/useTheme';

interface FolderCarouselProps {
    compact?: boolean;
}

export default function FolderCarousel({ compact = false }: FolderCarouselProps) {
    const { colors, isDark } = useTheme();
    const { folders, selectedFolderId, setSelectedFolder, createFolder } = useWardrobeStore();
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const scrollRef = useRef<ScrollView>(null);

    const scroll = (direction: 'left' | 'right') => {
        // Note: React Native ScrollView doesn't have direct scrollBy, so we use scrollTo with offset
        // This is a simplified version - in production you'd track scroll position
        scrollRef.current?.scrollTo({ x: direction === 'left' ? 0 : 500, animated: true });
    };

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
            {/* Left Arrow Button */}
            <Pressable
                style={styles.arrowButton}
                onPress={() => scroll('left')}
            >
                <Feather name="chevron-left" size={16} color="#4b5563" />
            </Pressable>

            <ScrollView
                ref={scrollRef}
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
                                isSelected ? styles.folderTabActive : styles.folderTabInactive,
                                isDark && !isSelected && { backgroundColor: '#18181b', borderColor: '#3f3f46' },
                                isDark && isSelected && { backgroundColor: '#fff', borderColor: '#fff' },
                            ]}
                            onPress={() => setSelectedFolder(folder.id)}
                            activeOpacity={0.7}
                        >
                            <Text
                                style={[
                                    styles.folderName,
                                    { color: isSelected ? (isDark ? '#000' : '#fff') : '#4b5563' },
                                    isDark && !isSelected && { color: '#a1a1aa' },
                                ]}
                            >
                                {folder.name}
                            </Text>
                            {!compact && (
                                <View
                                    style={[
                                        styles.assetCount,
                                        isSelected ? styles.assetCountActive : styles.assetCountInactive,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.assetCountText,
                                            { color: isSelected ? (isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)') : '#9ca3af' },
                                        ]}
                                    >
                                        {folder.assets.length}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}

                {/* Add Folder Button - Purple styling */}
                <TouchableOpacity
                    style={styles.addFolderButton}
                    onPress={() => setIsCreatingFolder(true)}
                    activeOpacity={0.7}
                >
                    <Text style={styles.addFolderText}>
                        {compact ? '+ Folder' : '+ New Folder'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Right Arrow Button */}
            <Pressable
                style={[styles.arrowButton, styles.arrowButtonRight]}
                onPress={() => scroll('right')}
            >
                <Feather name="chevron-right" size={16} color="#4b5563" />
            </Pressable>

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
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 8,
        paddingHorizontal: 40, // Increased to make room for arrows
    },
    arrowButton: {
        position: 'absolute',
        left: 16,
        zIndex: 10,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 16,
        padding: 6,
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
        elevation: 1,
    },
    arrowButtonRight: {
        left: undefined,
        right: 16,
    },
    scrollContent: {
        paddingHorizontal: 4, // Reduced since container has more padding now
        gap: 8,
    },
    folderTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        gap: 6,
    },
    folderTabActive: {
        backgroundColor: '#000',
        borderColor: '#000',
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)',
        elevation: 3,
    },
    folderTabInactive: {
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
    },
    folderName: {
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    assetCount: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    assetCountActive: {
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    assetCountInactive: {
        backgroundColor: '#f3f4f6',
    },
    assetCountText: {
        fontSize: 10,
        fontWeight: '600',
        fontFamily: 'Inter_600SemiBold',
    },
    addFolderButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#faf5ff',
        borderWidth: 1,
        borderRadius: 12,
        borderStyle: 'dashed',
        borderColor: '#d8b4fe',
        gap: 4,
    },
    addFolderText: {
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
        color: '#9333ea',
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
