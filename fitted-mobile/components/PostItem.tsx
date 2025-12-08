import React from 'react';
import { StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';

import { Text, View } from '@/components/Themed';
import MentionText from '@/components/MentionText';
import { Post } from '@/types';

const { width } = Dimensions.get('window');
const POST_SIZE = width;

interface PostItemProps {
    post: Post;
    onLike: () => void;
    onComment: () => void;
    onShare: () => void;
    onSave: () => void;
    onUserPress: () => void;
}

export default function PostItem({ post, onLike, onComment, onShare, onSave, onUserPress }: PostItemProps) {
    const user = post.user;

    return (
        <View style={styles.container}>
            {/* Header */}
            <Pressable style={styles.header} onPress={onUserPress}>
                <View style={styles.userInfo}>
                    {user?.avatar_url ? (
                        <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Feather name="user" size={16} color="#666" />
                        </View>
                    )}
                    <View style={styles.userText}>
                        <Text style={styles.username}>{user?.username || 'User'}</Text>
                        <Text style={styles.handle}>{user?.handle || '@user'}</Text>
                    </View>
                </View>
                <Feather name="more-horizontal" size={20} color="#888" />
            </Pressable>

            {/* Image */}
            <View style={styles.imageContainer}>
                <ExpoImage
                    source={{ uri: post.generated_image }}
                    style={styles.image}
                    contentFit="cover"
                    transition={200}
                />

                {/* Overlay Actions */}
                <View style={styles.actionsOverlay}>
                    <Pressable style={styles.actionButton} onPress={onLike}>
                        <Ionicons
                            name={post.is_liked ? "heart" : "heart-outline"}
                            size={26}
                            color={post.is_liked ? "#ff3b5c" : "#fff"}
                        />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={onComment}>
                        <Feather name="message-circle" size={24} color="#fff" />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={onShare}>
                        <Feather name="send" size={24} color="#fff" />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={onSave}>
                        <Ionicons
                            name={post.is_saved ? "bookmark" : "bookmark-outline"}
                            size={24}
                            color={post.is_saved ? "#fff" : "#fff"}
                        />
                    </Pressable>
                </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.likes}>{post.likes_count || 0} likes</Text>
                {post.caption ? (
                    <Text style={styles.caption}>
                        <Text style={styles.captionUsername} onPress={onUserPress}>{user?.username} </Text>
                        <MentionText text={post.caption} style={styles.captionText} />
                    </Text>
                ) : null}
                <Text style={styles.timestamp}>
                    {formatTime(post.created_at)}
                </Text>
            </View>
        </View>
    );
}

function formatTime(timestamp: string): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#000',
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'transparent',
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    avatarPlaceholder: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userText: {
        marginLeft: 10,
        backgroundColor: 'transparent',
    },
    username: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    handle: {
        fontSize: 12,
        color: '#888',
    },
    imageContainer: {
        width: POST_SIZE,
        height: POST_SIZE,
        backgroundColor: '#111',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    actionsOverlay: {
        position: 'absolute',
        right: 12,
        bottom: 12,
        backgroundColor: 'transparent',
    },
    actionButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    footer: {
        padding: 12,
        backgroundColor: 'transparent',
    },
    likes: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    caption: {
        fontSize: 14,
        color: '#fff',
        lineHeight: 20,
    },
    captionUsername: {
        fontWeight: '600',
    },
    captionText: {
        color: '#fff',
    },
    timestamp: {
        fontSize: 12,
        color: '#666',
        marginTop: 6,
    },
});
