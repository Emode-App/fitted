import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    Dimensions,
    FlatList,
    Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 48) / 2; // 2 columns with padding

export interface Draft {
    id: string;
    type: 'board' | 'post';
    thumbnail_url: string | null;
    created_at: string;
    updated_at: string;
}

interface DraftsModalProps {
    visible: boolean;
    onClose: () => void;
    drafts: Draft[];
    onDeleteDraft: (id: string) => void;
}

export default function DraftsModal({
    visible,
    onClose,
    drafts,
    onDeleteDraft,
}: DraftsModalProps) {
    const { colors } = useTheme();
    const [activeTab, setActiveTab] = useState<'board' | 'post'>('board');

    const filteredDrafts = drafts.filter(d => d.type === activeTab);

    const handleDraftPress = (draft: Draft) => {
        onClose();
        // Navigate to create with draftId - step will be determined by type
        router.push({ pathname: '/(tabs)/create', params: { draftId: draft.id } });
    };

    const handleDeletePress = (draft: Draft) => {
        Alert.alert(
            'Delete Draft',
            'Are you sure you want to delete this draft?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDeleteDraft(draft.id) },
            ]
        );
    };

    const renderDraftItem = ({ item }: { item: Draft }) => (
        <Pressable
            style={[styles.draftCard, { backgroundColor: colors.backgroundSecondary }]}
            onPress={() => handleDraftPress(item)}
            onLongPress={() => handleDeletePress(item)}
        >
            <View style={styles.draftThumbnail}>
                {item.thumbnail_url ? (
                    <Image
                        source={{ uri: item.thumbnail_url }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                    />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backgroundTertiary }]}>
                        <Feather name={item.type === 'board' ? 'layout' : 'image'} size={32} color={colors.textTertiary} />
                    </View>
                )}
                <View style={styles.draftTypeBadge}>
                    <Text style={styles.draftTypeBadgeText}>{item.type === 'board' ? 'BOARD' : 'POST'}</Text>
                </View>
            </View>
            <View style={styles.draftInfo}>
                <Text style={[styles.draftDate, { color: colors.textSecondary }]}>
                    {new Date(item.updated_at).toLocaleDateString()}
                </Text>
                <Pressable onPress={() => handleDeletePress(item)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={colors.textTertiary} />
                </Pressable>
            </View>
        </Pressable>
    );

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.title, { color: colors.text }]}>Drafts</Text>
                        <Pressable onPress={onClose} hitSlop={12}>
                            <Feather name="x" size={24} color={colors.text} />
                        </Pressable>
                    </View>

                    {/* Tabs */}
                    <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
                        <Pressable
                            style={[styles.tab, activeTab === 'board' && [styles.tabActive, { borderBottomColor: colors.text }]]}
                            onPress={() => setActiveTab('board')}
                        >
                            <Feather name="layout" size={16} color={activeTab === 'board' ? colors.text : colors.textSecondary} />
                            <Text style={[styles.tabText, { color: activeTab === 'board' ? colors.text : colors.textSecondary }]}>
                                Boards
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tab, activeTab === 'post' && [styles.tabActive, { borderBottomColor: colors.text }]]}
                            onPress={() => setActiveTab('post')}
                        >
                            <Feather name="image" size={16} color={activeTab === 'post' ? colors.text : colors.textSecondary} />
                            <Text style={[styles.tabText, { color: activeTab === 'post' ? colors.text : colors.textSecondary }]}>
                                Posts
                            </Text>
                        </Pressable>
                    </View>

                    {/* Drafts Grid */}
                    <FlatList
                        data={filteredDrafts}
                        keyExtractor={(item) => item.id}
                        numColumns={2}
                        renderItem={renderDraftItem}
                        contentContainerStyle={styles.grid}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.empty}>
                                <Feather name={activeTab === 'board' ? 'layout' : 'image'} size={48} color={colors.textTertiary} />
                                <Text style={[styles.emptyText, { color: colors.text }]}>
                                    No {activeTab === 'board' ? 'board' : 'post'} drafts
                                </Text>
                                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                                    {activeTab === 'board' ? 'Start building a fit to save drafts' : 'Generate a fit to save post drafts'}
                                </Text>
                            </View>
                        }
                    />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxHeight: '85%',
        borderRadius: 20,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    tabs: {
        flexDirection: 'row',
        borderBottomWidth: 1,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomWidth: 2,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Inter_600SemiBold',
    },
    grid: {
        padding: 16,
        gap: 16,
    },
    draftCard: {
        width: GRID_SIZE,
        marginHorizontal: 8,
        marginBottom: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    draftThumbnail: {
        width: '100%',
        aspectRatio: 1,
        position: 'relative',
    },
    draftTypeBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    draftTypeBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    draftInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
    },
    draftDate: {
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
    },
    empty: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
        fontFamily: 'Inter_700Bold',
    },
    emptySubtext: {
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
        fontFamily: 'Inter_400Regular',
    },
});
