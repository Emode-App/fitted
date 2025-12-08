import { StyleSheet, FlatList, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useMessagesStore } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';

export default function MessagesScreen() {
    const user = useAuthStore((state) => state.user);
    const conversations = useMessagesStore((state) => state.conversations);
    const activeConversation = useMessagesStore((state) => state.activeConversation);
    const messages = useMessagesStore((state) => state.messages);
    const isLoading = useMessagesStore((state) => state.isLoading);
    const fetchConversations = useMessagesStore((state) => state.fetchConversations);
    const fetchMessages = useMessagesStore((state) => state.fetchMessages);
    const sendMessage = useMessagesStore((state) => state.sendMessage);
    const setActiveConversation = useMessagesStore((state) => state.setActiveConversation);

    const [newMessage, setNewMessage] = useState('');
    const flatListRef = useRef<FlatList>(null);

    useFocusEffect(
        useCallback(() => {
            if (user?.id) {
                fetchConversations(user.id);
            }
        }, [user])
    );

    useEffect(() => {
        if (activeConversation) {
            fetchMessages(activeConversation.id);
        }
    }, [activeConversation]);

    const handleSend = async () => {
        if (!newMessage.trim() || !user || !activeConversation) return;

        await sendMessage(activeConversation.id, user.id, newMessage.trim());
        setNewMessage('');

        // Scroll to bottom
        setTimeout(() => {
            flatListRef.current?.scrollToEnd();
        }, 100);
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
        if (days < 7) return `${days}d`;

        return date.toLocaleDateString();
    };

    const handleUserPress = (userId: string) => {
        router.push({ pathname: '/user/[id]', params: { id: userId } });
    };

    // Chat View
    if (activeConversation) {
        return (
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* Chat Header */}
                <View style={styles.chatHeader}>
                    <Pressable onPress={() => setActiveConversation(null)} style={styles.backButton}>
                        <Feather name="arrow-left" size={24} color="#fff" />
                    </Pressable>
                    <Pressable style={styles.chatUserInfo} onPress={() => handleUserPress(activeConversation.otherUser?.id)}>
                        {activeConversation.otherUser?.avatar_url ? (
                            <Image source={{ uri: activeConversation.otherUser.avatar_url }} style={styles.chatAvatar} />
                        ) : (
                            <View style={styles.chatAvatarPlaceholder}>
                                <Feather name="user" size={16} color="#666" />
                            </View>
                        )}
                        <Text style={styles.chatUsername}>{activeConversation.otherUser?.username || 'User'}</Text>
                    </Pressable>
                    <View style={{ width: 40 }} />
                </View>

                {/* Messages */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContent}
                    renderItem={({ item }) => {
                        const isOwn = item.sender_id === user?.id;
                        return (
                            <View style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}>
                                <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>{item.text}</Text>
                                <Text style={[styles.messageTime, isOwn && styles.ownMessageTime]}>
                                    {formatTime(item.created_at)}
                                </Text>
                            </View>
                        );
                    }}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
                    ListEmptyComponent={
                        <View style={styles.emptyMessages}>
                            <Text style={styles.emptyMessagesText}>No messages yet</Text>
                            <Text style={styles.emptyMessagesSubtext}>Say hello!</Text>
                        </View>
                    }
                />

                {/* Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.messageInput}
                        placeholder="Message..."
                        placeholderTextColor="#666"
                        value={newMessage}
                        onChangeText={setNewMessage}
                        multiline
                        maxLength={1000}
                    />
                    <Pressable
                        style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
                        onPress={handleSend}
                        disabled={!newMessage.trim()}
                    >
                        <Feather name="send" size={20} color={newMessage.trim() ? "#000" : "#666"} />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        );
    }

    // Conversations List
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Messages</Text>
                <Pressable>
                    <Feather name="edit" size={22} color="#fff" />
                </Pressable>
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="large" />
                </View>
            ) : conversations.length > 0 ? (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <Pressable style={styles.conversationItem} onPress={() => setActiveConversation(item)}>
                            <View style={styles.avatarContainer}>
                                {item.otherUser?.avatar_url ? (
                                    <Image source={{ uri: item.otherUser.avatar_url }} style={styles.avatar} />
                                ) : (
                                    <View style={styles.avatarPlaceholder}>
                                        <Feather name="user" size={24} color="#666" />
                                    </View>
                                )}
                            </View>
                            <View style={styles.conversationInfo}>
                                <Text style={styles.username}>{item.otherUser?.username || 'User'}</Text>
                                <Text style={styles.lastMessage} numberOfLines={1}>
                                    {item.lastMessage?.text || 'Start a conversation'}
                                </Text>
                            </View>
                            {item.lastMessage && (
                                <Text style={styles.timestamp}>{formatTime(item.lastMessage.created_at)}</Text>
                            )}
                        </Pressable>
                    )}
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Feather name="message-circle" size={64} color="#333" />
                    <Text style={styles.emptyText}>No messages yet</Text>
                    <Text style={styles.emptySubtext}>Start a conversation with a stylist</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#000',
        borderBottomWidth: 0.5,
        borderBottomColor: '#222',
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    conversationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: '#222',
        backgroundColor: 'transparent',
    },
    avatarContainer: {
        marginRight: 12,
        backgroundColor: 'transparent',
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
    },
    avatarPlaceholder: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    conversationInfo: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    username: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    lastMessage: {
        fontSize: 14,
        color: '#888',
        marginTop: 2,
    },
    timestamp: {
        fontSize: 12,
        color: '#666',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    emptyText: {
        fontSize: 18,
        color: '#fff',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#666',
        marginTop: 8,
    },
    // Chat styles
    chatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#000',
        borderBottomWidth: 0.5,
        borderBottomColor: '#222',
    },
    backButton: {
        width: 40,
    },
    chatUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    chatAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    chatAvatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
    },
    chatUsername: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginLeft: 10,
    },
    messagesList: {
        flex: 1,
    },
    messagesContent: {
        padding: 16,
    },
    messageBubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 18,
        marginBottom: 8,
    },
    ownMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#fff',
    },
    otherMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#222',
    },
    messageText: {
        fontSize: 15,
        color: '#fff',
        lineHeight: 20,
    },
    ownMessageText: {
        color: '#000',
    },
    messageTime: {
        fontSize: 10,
        color: '#888',
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    ownMessageTime: {
        color: '#666',
    },
    emptyMessages: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
        backgroundColor: 'transparent',
    },
    emptyMessagesText: {
        fontSize: 16,
        color: '#888',
    },
    emptyMessagesSubtext: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        paddingBottom: 30,
        borderTopWidth: 0.5,
        borderTopColor: '#222',
        backgroundColor: '#000',
    },
    messageInput: {
        flex: 1,
        backgroundColor: '#1a1a1a',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: '#fff',
        fontSize: 15,
        maxHeight: 100,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    sendButtonDisabled: {
        backgroundColor: '#222',
    },
});
