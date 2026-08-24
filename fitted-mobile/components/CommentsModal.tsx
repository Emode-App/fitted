import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, View, Animated, PanResponder, Dimensions, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import { Text } from '@/components/Themed';
import MentionText from '@/components/MentionText';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/hooks/useTheme';
import { Comment, User } from '@/types';
import { blockUser, reportContent } from '@/services/moderation';

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
    const { colors, isDark } = useTheme();
    const [comments, setComments] = useState<CommentWithUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
    const user = useAuthStore((state) => state.user);

    const translateY = useRef(new Animated.Value(0)).current;
    /**
     * One swipe handle per comment, so tapping the trash can close the row it
     * belongs to. Object refs rather than callback refs -- Swipeable types its
     * `ref` as a RefObject and rejects a function.
     */
    const swipeRefs = useRef<Record<string, { current: any }>>({});
    const swipeRefFor = (commentId: string) => {
        if (!swipeRefs.current[commentId]) swipeRefs.current[commentId] = { current: null };
        return swipeRefs.current[commentId];
    };

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
                    Animated.timing(translateY, {
                        toValue: MODAL_HEIGHT,
                        duration: 150,
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        onClose();
                    });
                } else {
                    Animated.timing(translateY, {
                        toValue: 0,
                        duration: 150,
                        useNativeDriver: Platform.OS !== 'web',
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

                if (user?.id && data.length > 0) {
                    const commentIds = data.map(c => c.id);
                    const { data: likedData } = await supabase
                        .from('comment_likes')
                        .select('comment_id')
                        .eq('user_id', user.id)
                        .in('comment_id', commentIds);

                    if (likedData) {
                        setLikedComments(new Set(likedData.map(l => l.comment_id)));
                    }
                }
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
            const { data: commentData, error } = await supabase.from('comments').insert({
                post_id: postId,
                user_id: user.id,
                text: newComment.trim(),
            })
                .select()
                .single();

            if (!error && commentData) {
                setNewComment('');
                fetchComments();

                if (postOwnerId && postOwnerId !== user.id) {
                    await supabase.from('notifications').insert({
                        user_id: postOwnerId,
                        actor_id: user.id,
                        type: 'comment',
                        post_id: postId,
                        comment_id: commentData.id,
                        content: newComment.trim().slice(0, 100),
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

    const toggleCommentLike = async (commentId: string) => {
        if (!user?.id) return;

        const isLiked = likedComments.has(commentId);

        setLikedComments(prev => {
            const newSet = new Set(prev);
            if (isLiked) {
                newSet.delete(commentId);
            } else {
                newSet.add(commentId);
            }
            return newSet;
        });

        setComments(prev => prev.map(c =>
            c.id === commentId
                ? { ...c, likes_count: (c.likes_count || 0) + (isLiked ? -1 : 1) }
                : c
        ));

        try {
            if (isLiked) {
                await supabase
                    .from('comment_likes')
                    .delete()
                    .eq('comment_id', commentId)
                    .eq('user_id', user.id);
            } else {
                await supabase
                    .from('comment_likes')
                    .insert({ comment_id: commentId, user_id: user.id });
            }
        } catch (error) {
            setLikedComments(prev => {
                const newSet = new Set(prev);
                if (isLiked) {
                    newSet.add(commentId);
                } else {
                    newSet.delete(commentId);
                }
                return newSet;
            });
            setComments(prev => prev.map(c =>
                c.id === commentId
                    ? { ...c, likes_count: (c.likes_count || 0) + (isLiked ? 1 : -1) }
                    : c
            ));
        }
    };

    const showCommentActions = (comment: CommentWithUser) => {
        if (!user || comment.user_id === user.id) return;
        Alert.alert('Comment Options', `Take action on ${comment.user?.username || 'this user'}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Report Comment', onPress: async () => {
                    const result = await reportContent({ contentType: 'comment', contentId: comment.id, reportedUserId: comment.user_id, reason: 'Objectionable comment' });
                    Alert.alert(result.error ? 'Could Not Report' : 'Report Received', result.error || 'Thank you. Our moderation team will review this comment.');
                },
            },
            {
                text: 'Block User', style: 'destructive', onPress: async () => {
                    const result = await blockUser(comment.user_id);
                    if (result.error) return Alert.alert('Could Not Block User', result.error);
                    setComments((items) => items.filter((item) => item.user_id !== comment.user_id));
                    Alert.alert('User Blocked', 'You will no longer see or receive interactions from this account.');
                },
            },
        ]);
    };

    /**
     * Remove your own comment.
     *
     * There was no way to do this at all: the overflow menu is rendered only for
     * OTHER people's comments (report and block), so your own had no affordance
     * whatsoever. The delete policy on the table has always allowed it.
     */
    const handleDeleteComment = (comment: CommentWithUser) => {
        if (!user || comment.user_id !== user.id) return;

        Alert.alert('Delete comment', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    // Drop it locally first so the row leaves under the swipe,
                    // and put it back if the server disagrees.
                    const previous = comments;
                    setComments((items) => items.filter((item) => item.id !== comment.id));

                    const { error } = await supabase
                        .from('comments')
                        .delete()
                        .eq('id', comment.id)
                        .eq('user_id', user.id);

                    if (error) {
                        console.error('[comments] delete failed:', error);
                        setComments(previous);
                        Alert.alert('Could not delete', 'Please try again.');
                    }
                },
            },
        ]);
    };

    /** Red trash panel revealed by swiping a comment to the right. */
    const renderDeleteAction = (comment: CommentWithUser) => () => (
        <Pressable
            onPress={() => {
                swipeRefs.current[comment.id]?.current?.close();
                handleDeleteComment(comment);
            }}
            style={styles.deleteAction}
            accessibilityLabel="Delete comment"
        >
            <Feather name="trash-2" size={20} color="#ffffff" />
        </Pressable>
    );

    const renderComment = ({ item }: { item: CommentWithUser }) => {
        const row = (
        <View style={[styles.commentItem, { backgroundColor: colors.background }]}>
            <Pressable style={styles.avatarContainer} onPress={() => handleCommentUserPress(item.user?.id)}>
                {item.user?.avatar_url ? (
                    <Image source={{ uri: item.user.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                        <Feather name="user" size={14} color={colors.textSecondary} />
                    </View>
                )}
            </Pressable>
            <View style={styles.commentContent}>
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
                    <Text style={{ fontWeight: '600' }} onPress={() => handleCommentUserPress(item.user?.id)}>{item.user?.username || 'User'} </Text>
                    <MentionText text={item.text} style={{ color: colors.text }} />
                </Text>
                <View style={styles.commentMeta}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>{formatTime(item.created_at)}</Text>
                    {(item.likes_count || 0) > 0 && (
                        <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '600' }}>
                            {item.likes_count} like{(item.likes_count || 0) !== 1 ? 's' : ''}
                        </Text>
                    )}
                </View>
            </View>
            <Pressable style={styles.likeButton} onPress={() => toggleCommentLike(item.id)}>
                <Ionicons
                    name={likedComments.has(item.id) ? 'heart' : 'heart-outline'}
                    size={15}
                    color={likedComments.has(item.id) ? '#ff3b5c' : colors.textTertiary}
                />
            </Pressable>
            <Pressable
                style={styles.likeButton}
                onPress={() => (item.user_id === user?.id ? handleDeleteComment(item) : showCommentActions(item))}
                accessibilityLabel={item.user_id === user?.id ? 'Delete comment' : 'Comment moderation options'}
            >
                <Feather
                    name={item.user_id === user?.id ? 'trash-2' : 'more-horizontal'}
                    size={15}
                    color={colors.textTertiary}
                />
            </Pressable>
        </View>
        );

        // Only your own comment swipes; there is nothing to reveal on anyone
        // else's, and a swipe that opens an empty panel reads as broken.
        if (item.user_id !== user?.id) return row;

        return (
            <Swipeable
                ref={swipeRefFor(item.id)}
                friction={2}
                leftThreshold={40}
                renderLeftActions={renderDeleteAction(item)}
            >
                {row}
            </Swipeable>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <GestureHandlerRootView style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.container}
                >
                    <Animated.View
                        style={[
                            styles.modal,
                            {
                                backgroundColor: colors.background,
                                transform: [{ translateY }]
                            }
                        ]}
                    >
                        {/* Drag Handle */}
                        <View {...panResponder.panHandlers} style={styles.dragHandleContainer}>
                            <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
                        </View>

                        {/* Header */}
                        <View style={[styles.header, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.title, { color: colors.text }]}>Comments</Text>
                            <Pressable onPress={onClose} style={styles.closeButton}>
                                <Feather name="x" size={24} color={colors.text} />
                            </Pressable>
                        </View>

                        {/* Comments List */}
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator color={colors.text} />
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
                                        <Text style={[styles.emptyText, { color: colors.text }]}>No comments yet</Text>
                                        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Be the first to comment!</Text>
                                    </View>
                                }
                            />
                        )}

                        {/* Input */}
                        <View style={[styles.inputContainer, { borderTopColor: colors.border }]}>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: colors.input,
                                        color: colors.text,
                                        borderColor: colors.inputBorder
                                    }
                                ]}
                                placeholder="Add a comment..."
                                placeholderTextColor={colors.placeholder}
                                value={newComment}
                                onChangeText={setNewComment}
                                multiline
                                maxLength={500}
                            />
                            <Pressable
                                style={[
                                    styles.sendButton,
                                    { backgroundColor: colors.primary },
                                    (!newComment.trim() || submitting) && { opacity: 0.5, backgroundColor: colors.border }
                                ]}
                                onPress={handleSubmit}
                                disabled={!newComment.trim() || submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                                ) : (
                                    <Feather name="send" size={18} color={colors.primaryForeground} />
                                )}
                            </Pressable>
                        </View>
                    </Animated.View>
                </KeyboardAvoidingView>
            </GestureHandlerRootView>
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
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: MODAL_HEIGHT,
        boxShadow: '0px -2px 3.84px rgba(0, 0, 0, 0.25)',
        elevation: 5,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 0.5,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
    },
    closeButton: {
        position: 'absolute',
        right: 16,
        top: 12,
        justifyContent: 'center',
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
    deleteAction: {
        backgroundColor: '#ef4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 72,
        marginBottom: 16,
        borderRadius: 10,
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
        justifyContent: 'center',
        alignItems: 'center',
    },
    commentContent: {
        flex: 1,
    },
    commentMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 12,
    },
    likeButton: {
        padding: 8,
        alignSelf: 'flex-start',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
    },
    emptySubtext: {
        fontSize: 14,
        marginTop: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        paddingBottom: 30, // For iOS home indicator
        borderTopWidth: 0.5,
    },
    input: {
        flex: 1,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 14,
        maxHeight: 100,
        borderWidth: 1,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
});
