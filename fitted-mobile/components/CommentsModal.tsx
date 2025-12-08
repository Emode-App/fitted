import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, View, Animated, PanResponder, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import { Text } from '@/components/Themed';
import MentionText from '@/components/MentionText';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Comment, User } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.5;

interface CommentsModalProps {
    postId: string;
    postOwnerId?: string;
    visible: boolean;
    onClose: () => void;
}

interface CommentWithUser extends Comment {
    user: User;
}

export default function CommentsModal({ postId, postOwnerId, visible, onClose }: CommentsModalProps) {
    const [comments, setComments] = useState<CommentWithUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const user = useAuthStore((state) => state.user);

    const translateY = useRef(new Animated.Value(0)).current;

    // Pan responder for swipe to close
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                translateY.stopAnimation();
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    translateY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 80 || gestureState.vy > 0.3) {
                    // Close modal - animate down then call onClose
                    Animated.timing(translateY, {
                        toValue: MODAL_HEIGHT,
                        duration: 150,
                        useNativeDriver: true,
                    }).start(() => {
                        onClose();
                    });
                } else {
                    // Snap back
                    Animated.timing(translateY, {
                        toValue: 0,
                        duration: 150,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    // Reset when modal opens
    useEffect(() => {
        if (visible && postId) {
            translateY.setValue(0);
            setComments([]);
            setLoading(true);
            fetchComments();
        }
    }, [visible, postId]);

    const fetchComments = async () => {
        try {
            const { data, error } = await supabase
                .from('comments')
                .select(`
          *,
          user:users!comments_user_id_fkey(*)
        `)
                .eq('post_id', postId)
                .order('created_at', { ascending: true });

            if (!error && data) {
                setComments(data as CommentWithUser[]);
            }
        } catch (err) {
            console.error('Error fetching comments:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!newComment.trim() || !user) return;

        setSubmitting(true);
        try {
            const { error } = await supabase.from('comments').insert({
                post_id: postId,
                user_id: user.id,
                text: newComment.trim(),
            });

            if (!error) {
                setNewComment('');
                fetchComments();

                // Create notification for post owner (if not commenting on own post)
                if (postOwnerId && postOwnerId !== user.id) {
                    await supabase.from('notifications').insert({
                        user_id: postOwnerId,
                        actor_id: user.id,
                        type: 'comment',
                        post_id: postId,
                    });
                }
            }
        } catch (err) {
            console.error('Error posting comment:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const formatTime = (timestamp: string): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'now';
        if (minutes < 60) return `${minutes}m`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;

        const days = Math.floor(hours / 24);
        return `${days}d`;
    };

    const handleCommentUserPress = (userId: string) => {
        onClose();
        router.push({ pathname: '/user/[id]', params: { id: userId } });
    };

    const renderComment = ({ item }: { item: CommentWithUser }) => (
        <View style={styles.commentItem}>
            <Pressable style={styles.avatarContainer} onPress={() => handleCommentUserPress(item.user?.id)}>
                {item.user?.avatar_url ? (
                    <Image source={{ uri: item.user.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Feather name="user" size={14} color="#666" />
                    </View>
                )}
            </Pressable>
            <View style={styles.commentContent}>
                <Text style={styles.commentText}>
                    <Text style={styles.username} onPress={() => handleCommentUserPress(item.user?.id)}>{item.user?.username || 'User'} </Text>
                    <MentionText text={item.text} style={styles.commentBodyText} />
                </Text>
                <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
            </View>
        </View>
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.container}
                >
                    <Animated.View
                        style={[
                            styles.modal,
                            { transform: [{ translateY }] }
                        ]}
                    >
                        {/* Drag Handle */}
                        <View {...panResponder.panHandlers} style={styles.dragHandleContainer}>
                            <View style={styles.dragHandle} />
                        </View>

                        {/* Header */}
                        <View style={styles.header}>
                            <Text style={styles.title}>Comments</Text>
                            <Pressable onPress={onClose} style={styles.closeButton}>
                                <Feather name="x" size={24} color="#fff" />
                            </Pressable>
                        </View>

                        {/* Comments List */}
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator color="#fff" />
                            </View>
                        ) : (
                            <FlatList
                                data={comments}
                                keyExtractor={(item) => item.id}
                                renderItem={renderComment}
                                style={styles.list}
                                contentContainerStyle={styles.listContent}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <Text style={styles.emptyText}>No comments yet</Text>
                                        <Text style={styles.emptySubtext}>Be the first to comment!</Text>
                                    </View>
                                }
                            />
                        )}

                        {/* Input */}
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Add a comment..."
                                placeholderTextColor="#666"
                                value={newComment}
                                onChangeText={setNewComment}
                                multiline
                                maxLength={500}
                            />
                            <Pressable
                                style={[styles.sendButton, (!newComment.trim() || submitting) && styles.sendButtonDisabled]}
                                onPress={handleSubmit}
                                disabled={!newComment.trim() || submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color="#000" size="small" />
                                ) : (
                                    <Feather name="send" size={18} color="#000" />
                                )}
                            </Pressable>
                        </View>
                    </Animated.View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modal: {
        backgroundColor: '#111',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: MODAL_HEIGHT,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    dragHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#444',
        borderRadius: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: '#333',
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    closeButton: {
        position: 'absolute',
        right: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        flex: 1,
    },
    listContent: {
        padding: 16,
    },
    commentItem: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
    },
    commentContent: {
        flex: 1,
    },
    commentText: {
        fontSize: 14,
        color: '#fff',
        lineHeight: 20,
    },
    username: {
        fontWeight: '600',
    },
    timestamp: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        color: '#fff',
        fontSize: 16,
    },
    emptySubtext: {
        color: '#666',
        fontSize: 14,
        marginTop: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        paddingBottom: 30,
        borderTopWidth: 0.5,
        borderTopColor: '#333',
    },
    input: {
        flex: 1,
        backgroundColor: '#222',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: '#fff',
        fontSize: 14,
        maxHeight: 100,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
    commentBodyText: {
        color: '#fff',
    },
});
