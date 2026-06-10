import { StyleSheet, FlatList, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Modal as RNModal, PanResponder, Alert } from 'react-native';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';

import { Text, View } from '@/components/Themed';
import { useMessagesStore } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import { User, Message } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { Input, Button } from '@/components/Shared';
import StylistModal from '@/components/StylistModal';
import PaymentRequestModal from '@/components/PaymentRequestModal';
import PaymentCard from '@/components/PaymentCard';
import OutfitDeliveryCard from '@/components/OutfitDeliveryCard';
import StripeConnectOnboarding from '@/components/StripeConnectOnboarding';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchPaymentIntent, checkConnectStatus, getStylistStripeAccountId } from '@/services/stripeService';

export default function MessagesScreen() {
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);
    const conversations = useMessagesStore((state) => state.conversations);
    const activeConversation = useMessagesStore((state) => state.activeConversation);
    const messages = useMessagesStore((state) => state.messages);
    const isLoading = useMessagesStore((state) => state.isLoading);
    const fetchConversations = useMessagesStore((state) => state.fetchConversations);
    const fetchMessages = useMessagesStore((state) => state.fetchMessages);
    const sendMessage = useMessagesStore((state) => state.sendMessage);
    const sendPaymentRequest = useMessagesStore((state) => state.sendPaymentRequest);
    const respondToPayment = useMessagesStore((state) => state.respondToPayment);
    const sendFacePhoto = useMessagesStore((state) => state.sendFacePhoto);
    const setActiveConversation = useMessagesStore((state) => state.setActiveConversation);
    const createConversation = useMessagesStore((state) => state.createConversation);

    const [newMessage, setNewMessage] = useState('');
    const [showNewMessageModal, setShowNewMessageModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [searching, setSearching] = useState(false);
    const [conversationSearch, setConversationSearch] = useState('');
    const [showStylistModal, setShowStylistModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showConnectOnboarding, setShowConnectOnboarding] = useState(false);
    const [paymentProcessing, setPaymentProcessing] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Filter conversations by search
    const filteredConversations = conversationSearch.trim()
        ? conversations.filter(c =>
            c.otherUser?.username?.toLowerCase().includes(conversationSearch.toLowerCase()) ||
            c.otherUser?.handle?.toLowerCase().includes(conversationSearch.toLowerCase()) ||
            c.lastMessage?.text?.toLowerCase().includes(conversationSearch.toLowerCase())
        )
        : conversations;

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

        setTimeout(() => {
            flatListRef.current?.scrollToEnd();
        }, 100);
    };

    const handleSendPaymentRequest = async (amount: number, description: string) => {
        if (!user || !activeConversation) return;
        await sendPaymentRequest(activeConversation.id, user.id, amount, description);
        setTimeout(() => {
            flatListRef.current?.scrollToEnd();
        }, 100);
    };

    const handlePaymentAccept = async (messageId: string) => {
        if (!user || !activeConversation || paymentProcessing) return;

        // Find the message to get the amount and stylist info
        const paymentMessage = messages.find(m => m.id === messageId);
        if (!paymentMessage?.payment_request) return;

        const amount = paymentMessage.payment_request.amount;
        const stylistId = paymentMessage.sender_id;
        const description = paymentMessage.payment_request.description || 'Styling session';

        setPaymentProcessing(true);
        try {
            // Get the stylist's Stripe account ID
            const stylistStripeAccountId = await getStylistStripeAccountId(stylistId);

            if (!stylistStripeAccountId) {
                // Stylist hasn't connected Stripe yet — fall back to simulated payment
                Alert.alert(
                    'Payment Processing',
                    'The stylist has not yet connected their payment account. Processing as a simulated payment for now.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Continue (Test)',
                            onPress: async () => {
                                await respondToPayment(messageId, activeConversation.id, user.id, 'accept');
                            },
                        },
                    ]
                );
                return;
            }

            // Try to use Stripe PaymentSheet (only available in dev builds)
            let useStripe = false;
            try {
                const stripeMod = require('@stripe/stripe-react-native');
                if (stripeMod?.useStripe) {
                    useStripe = true;
                }
            } catch {
                // Not available in Expo Go
            }

            if (useStripe) {
                // Real Stripe flow
                const { initPaymentSheet, presentPaymentSheet } = require('@stripe/stripe-react-native');

                // Fetch PaymentIntent from server
                const paymentData = await fetchPaymentIntent(
                    amount,
                    stylistStripeAccountId,
                    activeConversation.id,
                    description
                );

                // Initialize PaymentSheet
                const { error: initError } = await initPaymentSheet({
                    paymentIntentClientSecret: paymentData.clientSecret,
                    customerId: paymentData.customerId,
                    customerEphemeralKeySecret: paymentData.ephemeralKey,
                    merchantDisplayName: 'Emode',
                    allowsDelayedPaymentMethods: false,
                });

                if (initError) {
                    Alert.alert('Error', initError.message);
                    return;
                }

                // Present PaymentSheet
                const { error: presentError } = await presentPaymentSheet();

                if (presentError) {
                    if (presentError.code !== 'Canceled') {
                        Alert.alert('Payment Failed', presentError.message);
                    }
                    return;
                }

                // Payment succeeded! Update the message status
                await respondToPayment(messageId, activeConversation.id, user.id, 'accept');
                Alert.alert('Payment Successful! 💰', `$${amount.toFixed(2)} has been sent to the stylist.`);
            } else {
                // Expo Go fallback — simulated payment
                Alert.alert(
                    'Development Mode',
                    `Real payments require a development build. Process $${amount.toFixed(2)} as a test payment?`,
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Pay (Test)',
                            onPress: async () => {
                                await respondToPayment(messageId, activeConversation.id, user.id, 'accept');
                            },
                        },
                    ]
                );
            }
        } catch (error: any) {
            console.error('Payment error:', error);
            Alert.alert('Payment Error', error.message || 'Failed to process payment.');
        } finally {
            setPaymentProcessing(false);
        }
    };

    const handlePaymentDecline = async (messageId: string) => {
        if (!user || !activeConversation) return;
        await respondToPayment(messageId, activeConversation.id, user.id, 'decline');
    };

    // Navigate stylist to create screen with client context
    const handleCreateOutfit = () => {
        if (!activeConversation) return;
        const clientId = activeConversation.otherUser?.id;
        const clientName = activeConversation.otherUser?.username || 'Client';

        // Look for the most recent shared face photo in the conversation
        const faceMessage = [...messages].reverse().find(m => m.shared_face_url);
        const clientFaceUrl = faceMessage?.shared_face_url || activeConversation.otherUser?.ai_face_url || '';

        router.push({
            pathname: '/(tabs)/create',
            params: {
                forConversation: activeConversation.id,
                forClientId: clientId,
                forClientName: clientName,
                forClientFaceUrl: clientFaceUrl,
            }
        });
    };

    // Client shares their face photo for styling
    const handleShareFace = async () => {
        if (!user || !activeConversation) return;

        // If user has an AI face photo already, offer to use it or pick new
        if (user.ai_face_url) {
            Alert.alert(
                'Share Face Photo',
                'Use your saved face photo or pick a new one?',
                [
                    {
                        text: 'Use Saved',
                        onPress: () => sendFacePhoto(activeConversation.id, user.id, user.ai_face_url!),
                    },
                    {
                        text: 'Pick New',
                        onPress: () => pickAndShareFace(),
                    },
                    { text: 'Cancel', style: 'cancel' },
                ]
            );
        } else {
            pickAndShareFace();
        }
    };

    const pickAndShareFace = async () => {
        if (!user || !activeConversation) return;

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant photo library access');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            // For now, send the local URI — in production this would upload first
            await sendFacePhoto(activeConversation.id, user.id, result.assets[0].uri);
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
        if (days < 7) return `${days}d`;

        return date.toLocaleDateString();
    };

    const handleUserPress = (userId: string) => {
        router.push({ pathname: '/user/[id]', params: { id: userId } });
    };

    const searchUsers = async (query: string) => {
        if (!query.trim() || !user?.id) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        try {
            const { data } = await supabase
                .from('users')
                .select('*')
                .neq('id', user.id)
                .or(`username.ilike.%${query}%,handle.ilike.%${query}%`)
                .limit(10);

            setSearchResults(data || []);
        } catch (error) {
            console.error('Error searching users:', error);
        } finally {
            setSearching(false);
        }
    };

    const handleSelectUser = async (selectedUser: User) => {
        if (!user?.id) return;

        const conversationId = await createConversation(user.id, selectedUser.id);
        if (conversationId) {
            await fetchConversations(user.id);
            const convo = conversations.find(c => c.id === conversationId);
            if (convo) {
                setActiveConversation(convo);
            }
        }
        setShowNewMessageModal(false);
        setSearchQuery('');
        setSearchResults([]);
    };

    // Pan responder for swipe to exit chat
    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
            // Only respond to horizontal swipes that are more horizontal than vertical
            return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx > 20;
        },
        onPanResponderRelease: (_, gestureState) => {
            // If swiped right more than 100px, exit conversation
            if (gestureState.dx > 100) {
                setActiveConversation(null);
            }
        },
    }), []);

    // Render a single message — PaymentCard, OutfitDeliveryCard, FaceShare, or regular bubble
    const renderMessage = ({ item }: { item: Message & { sender: User } }) => {
        const isOwn = item.sender_id === user?.id;

        // Payment request message → render PaymentCard
        if (item.payment_request) {
            return (
                <PaymentCard
                    paymentRequest={item.payment_request}
                    isOwnMessage={isOwn}
                    onAccept={() => handlePaymentAccept(item.id)}
                    onDecline={() => handlePaymentDecline(item.id)}
                    onCreateOutfit={handleCreateOutfit}
                    onShareFace={handleShareFace}
                    timestamp={item.created_at}
                />
            );
        }

        // Outfit delivery message → render OutfitDeliveryCard
        if (item.styling_delivery) {
            return (
                <OutfitDeliveryCard
                    delivery={item.styling_delivery}
                    isOwnMessage={isOwn}
                    timestamp={item.created_at}
                    onSaveToProfile={() => {
                        // TODO: implement save to profile (re-post)
                        Alert.alert('Coming Soon', 'Save to profile will be available soon!');
                    }}
                />
            );
        }

        // Face photo share → render face share card
        if (item.shared_face_url) {
            return (
                <View style={[
                    styles.faceShareCard,
                    {
                        alignSelf: isOwn ? 'flex-end' : 'flex-start',
                        backgroundColor: isDark ? 'rgba(139, 92, 246, 0.08)' : 'rgba(139, 92, 246, 0.06)',
                        borderColor: 'rgba(139, 92, 246, 0.2)',
                    }
                ]}>
                    <View style={styles.faceShareHeader}>
                        <View style={[styles.faceShareIcon, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                            <Feather name="camera" size={14} color="#8b5cf6" />
                        </View>
                        <Text style={[styles.faceShareLabel, { color: colors.textSecondary }]}>
                            {isOwn ? 'You shared your face photo' : 'Shared face photo for styling'}
                        </Text>
                    </View>
                    <Image
                        source={{ uri: item.shared_face_url }}
                        style={styles.faceShareImage}
                        contentFit="cover"
                    />
                    <Text style={[styles.messageTime, { color: colors.textTertiary, alignSelf: 'flex-end', marginTop: 6 }]}>
                        {formatTime(item.created_at)}
                    </Text>
                </View>
            );
        }

        // Regular text message
        return (
            <View style={[
                styles.messageBubble,
                isOwn
                    ? { backgroundColor: colors.primary, borderBottomRightRadius: 4, alignSelf: 'flex-end' }
                    : { backgroundColor: colors.backgroundSecondary, borderBottomLeftRadius: 4, alignSelf: 'flex-start' }
            ]}>
                <Text style={[
                    styles.messageText,
                    isOwn ? { color: colors.primaryForeground } : { color: colors.text }
                ]}>
                    {item.text}
                </Text>
                <Text style={[
                    styles.messageTime,
                    isOwn ? { color: colors.primaryForeground, opacity: 0.7 } : { color: colors.textSecondary }
                ]}>
                    {formatTime(item.created_at)}
                </Text>
            </View>
        );
    };

    const { isDark } = useTheme();

    // Chat View
    if (activeConversation) {
        const isStylist = user?.is_verified_stylist === true;

        return (
            <KeyboardAvoidingView
                style={[styles.container, { backgroundColor: colors.background }]}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                {...panResponder.panHandlers}
            >
                {/* Chat Header */}
                <View style={[styles.chatHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                    <Pressable onPress={() => setActiveConversation(null)} style={styles.backButton}>
                        <Feather name="arrow-left" size={24} color={colors.text} />
                    </Pressable>
                    <Pressable style={styles.chatUserInfo} onPress={() => handleUserPress(activeConversation.otherUser?.id)}>
                        {activeConversation.otherUser?.avatar_url ? (
                            <Image source={{ uri: activeConversation.otherUser.avatar_url }} style={styles.chatAvatar} />
                        ) : (
                            <View style={[styles.chatAvatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                                <Feather name="user" size={16} color={colors.textTertiary} />
                            </View>
                        )}
                        <Text style={[styles.chatUsername, { color: colors.text }]}>{activeConversation.otherUser?.username || 'User'}</Text>
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
                    renderItem={renderMessage}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
                    ListEmptyComponent={
                        <View style={styles.emptyMessages}>
                            <Text style={[styles.emptyMessagesText, { color: colors.textSecondary }]}>No messages yet</Text>
                            <Text style={[styles.emptyMessagesSubtext, { color: colors.textTertiary }]}>Say hello to start the convo!</Text>
                        </View>
                    }
                />

                {/* Input */}
                <View style={[styles.inputContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    {/* Payment Request Button — Only for verified stylists */}
                    {isStylist && (
                        <Pressable
                            style={[styles.paymentButton]}
                            onPress={async () => {
                                // Check if stylist has connected Stripe before allowing payment requests
                                if (user) {
                                    const status = await checkConnectStatus(user.id);
                                    if (!status.onboardingComplete) {
                                        setShowConnectOnboarding(true);
                                        return;
                                    }
                                }
                                setShowPaymentModal(true);
                            }}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669']}
                                style={styles.paymentButtonGradient}
                            >
                                <MaterialCommunityIcons name="currency-usd" size={20} color="#fff" />
                            </LinearGradient>
                        </Pressable>
                    )}

                    <TextInput
                        style={[styles.messageInput, {
                            backgroundColor: colors.backgroundSecondary,
                            color: colors.text,
                            borderColor: colors.border
                        }]}
                        placeholder="Message..."
                        placeholderTextColor={colors.textTertiary}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        multiline
                        maxLength={1000}
                    />
                    <Pressable
                        style={[styles.sendButton, { backgroundColor: newMessage.trim() ? colors.primary : colors.backgroundTertiary }]}
                        onPress={handleSend}
                        disabled={!newMessage.trim()}
                    >
                        <Feather name="send" size={20} color={newMessage.trim() ? colors.primaryForeground : colors.textTertiary} />
                    </Pressable>
                </View>

                {/* Payment Request Modal */}
                <PaymentRequestModal
                    visible={showPaymentModal}
                    onClose={() => setShowPaymentModal(false)}
                    onSend={handleSendPaymentRequest}
                    recipientName={activeConversation.otherUser?.username || 'User'}
                />
            </KeyboardAvoidingView>
        );
    }

    // Conversations List
    return (
        <>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                    <View style={styles.headerTitleRow}>
                        <Text style={[styles.title, { color: colors.text }]}>Messages</Text>
                        {/* Verification button - only show if not already verified */}
                        {!user?.is_verified_stylist && (
                            <Pressable
                                style={styles.verifyButton}
                                onPress={() => setShowStylistModal(true)}
                            >
                                <LinearGradient
                                    colors={['#3b82f6', '#2563eb']}
                                    style={styles.verifyButtonGradient}
                                >
                                    <MaterialCommunityIcons name="check-decagram" size={16} color="#fff" />
                                </LinearGradient>
                            </Pressable>
                        )}
                    </View>
                    <Pressable onPress={() => setShowNewMessageModal(true)} style={styles.iconButton}>
                        <Feather name="edit" size={22} color={colors.text} />
                    </Pressable>
                </View>

                {/* Search bar */}
                <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
                    <View style={[styles.searchInputWrapper, { backgroundColor: colors.backgroundSecondary }]}>
                        <Feather name="search" size={18} color={colors.textTertiary} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="Search messages..."
                            placeholderTextColor={colors.textTertiary}
                            value={conversationSearch}
                            onChangeText={setConversationSearch}
                        />
                        {conversationSearch.length > 0 && (
                            <Pressable onPress={() => setConversationSearch('')}>
                                <Feather name="x" size={18} color={colors.textTertiary} />
                            </Pressable>
                        )}
                    </View>
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator color={colors.text} size="large" />
                    </View>
                ) : filteredConversations.length > 0 ? (
                    <FlatList
                        data={filteredConversations}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <Pressable style={[styles.conversationItem, { borderBottomColor: colors.border }]} onPress={() => setActiveConversation(item)}>
                                <View style={styles.avatarContainer}>
                                    {item.otherUser?.avatar_url ? (
                                        <Image source={{ uri: item.otherUser.avatar_url }} style={styles.avatar} />
                                    ) : (
                                        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                                            <Feather name="user" size={24} color={colors.textTertiary} />
                                        </View>
                                    )}
                                </View>
                                <View style={styles.conversationInfo}>
                                    <View style={styles.topRow}>
                                        <Text style={[styles.username, { color: colors.text }]}>{item.otherUser?.username || 'User'}</Text>
                                        {item.lastMessage && (
                                            <Text style={[styles.timestamp, { color: colors.textTertiary }]}>{formatTime(item.lastMessage.created_at)}</Text>
                                        )}
                                    </View>
                                    <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {item.lastMessage?.styling_delivery
                                            ? '🎨 Outfit delivered'
                                            : item.lastMessage?.shared_face_url
                                                ? '📸 Face photo shared'
                                                : item.lastMessage?.payment_request
                                                    ? `💰 $${item.lastMessage.payment_request.amount.toFixed(2)} — ${item.lastMessage.payment_request.status}`
                                                    : item.lastMessage?.text || 'Start a conversation'
                                        }
                                    </Text>
                                </View>
                            </Pressable>
                        )}
                    />
                ) : (
                    <View style={styles.emptyContainer}>
                        <Feather name="message-circle" size={64} color={colors.textTertiary} />
                        <Text style={[styles.emptyText, { color: colors.text }]}>No messages yet</Text>
                        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Start a conversation with a stylist</Text>
                        <Button
                            variant="primary"
                            onPress={() => setShowNewMessageModal(true)}
                            style={{ marginTop: 24 }}
                        >
                            Start Chat
                        </Button>
                    </View>
                )}

                {/* New Message Modal */}
                <RNModal
                    visible={showNewMessageModal}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setShowNewMessageModal(false)}
                >
                    <Pressable style={styles.modalOverlay} onPress={() => setShowNewMessageModal(false)}>
                        <Pressable
                            style={[styles.newMessageModal, { backgroundColor: colors.background }]}
                            onPress={(e) => e.stopPropagation()}
                        >
                            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>New Message</Text>
                                <Pressable onPress={() => {
                                    setShowNewMessageModal(false);
                                    setSearchQuery('');
                                    setSearchResults([]);
                                }}>
                                    <Feather name="x" size={24} color={colors.text} />
                                </Pressable>
                            </View>

                            <View style={styles.searchContainer}>
                                <Input
                                    placeholder="Search users..."
                                    value={searchQuery}
                                    onChangeText={(text) => {
                                        setSearchQuery(text);
                                        searchUsers(text);
                                    }}
                                    autoFocus
                                    leftIcon={<Feather name="search" size={18} color={colors.textTertiary} />}
                                />
                            </View>

                            <FlatList
                                data={searchResults}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => (
                                    <Pressable style={[styles.searchResultItem, { borderBottomColor: colors.border }]} onPress={() => handleSelectUser(item)}>
                                        {item.avatar_url ? (
                                            <Image source={{ uri: item.avatar_url }} style={styles.searchAvatar} />
                                        ) : (
                                            <View style={[styles.searchAvatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                                                <Feather name="user" size={18} color={colors.textTertiary} />
                                            </View>
                                        )}
                                        <View style={styles.searchUserInfo}>
                                            <Text style={[styles.searchUsername, { color: colors.text }]}>{item.username}</Text>
                                            <Text style={[styles.searchHandle, { color: colors.textSecondary }]}>{item.handle}</Text>
                                        </View>
                                    </Pressable>
                                )}
                                ListEmptyComponent={
                                    searchQuery.trim() ? (
                                        <Text style={[styles.noResults, { color: colors.textSecondary }]}>
                                            {searching ? 'Searching...' : 'No users found'}
                                        </Text>
                                    ) : null
                                }
                            />
                        </Pressable>
                    </Pressable>
                </RNModal>
            </View>

            {/* Stylist Verification Modal */}
            <StylistModal
                visible={showStylistModal}
                onClose={() => setShowStylistModal(false)}
            />

            {/* Stripe Connect Onboarding Modal */}
            <StripeConnectOnboarding
                visible={showConnectOnboarding}
                onClose={() => setShowConnectOnboarding(false)}
                onComplete={() => {
                    setShowConnectOnboarding(false);
                    // After Connect onboarding, open the payment modal
                    setShowPaymentModal(true);
                }}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 24, fontWeight: '800', fontFamily: 'Inter_900Black' },
    verifyButton: { borderRadius: 16, overflow: 'hidden' },
    verifyButtonGradient: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    iconButton: { padding: 4 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Search bar for conversations
    searchContainer: { paddingHorizontal: 20, paddingVertical: 10 },
    searchInputWrapper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, gap: 10 },
    searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },

    // Conversation List
    conversationItem: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, alignItems: 'center' },
    avatarContainer: { marginRight: 12 },
    avatar: { width: 56, height: 56, borderRadius: 28 },
    avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
    conversationInfo: { flex: 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    username: { fontSize: 16, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    timestamp: { fontSize: 12, fontFamily: 'Inter_400Regular' },
    lastMessage: { fontSize: 14, fontFamily: 'Inter_500Medium' },

    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    emptyText: { fontSize: 18, fontWeight: '700', marginTop: 16, fontFamily: 'Inter_700Bold' },
    emptySubtext: { fontSize: 14, marginTop: 8, textAlign: 'center', fontFamily: 'Inter_400Regular' },

    // Chat
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
    backButton: { width: 40 },
    chatUserInfo: { flexDirection: 'row', alignItems: 'center' },
    chatAvatar: { width: 32, height: 32, borderRadius: 16 },
    chatAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    chatUsername: { fontSize: 16, fontWeight: '700', marginLeft: 10, fontFamily: 'Inter_700Bold' },
    messagesList: { flex: 1 },
    messagesContent: { padding: 16, paddingBottom: 32 },
    messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 18, marginBottom: 8 },
    messageText: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_400Regular' },
    messageTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end', fontFamily: 'Inter_400Regular' },

    emptyMessages: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
    emptyMessagesText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    emptyMessagesSubtext: { fontSize: 14, marginTop: 4, fontFamily: 'Inter_400Regular' },

    inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1 },
    messageInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, borderWidth: 1, fontFamily: 'Inter_400Regular', paddingTop: 10 },
    sendButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },

    // Payment Button
    paymentButton: { marginRight: 8 },
    paymentButtonGradient: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

    // Face Share Card
    faceShareCard: {
        maxWidth: '70%',
        borderRadius: 16,
        borderWidth: 1,
        padding: 12,
        marginBottom: 8,
    },
    faceShareHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 8,
    },
    faceShareIcon: {
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
    },
    faceShareLabel: {
        fontSize: 12,
        fontWeight: '500',
        fontFamily: 'Inter_500Medium',
        flex: 1,
    },
    faceShareImage: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 12,
    },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    newMessageModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', paddingHorizontal: 20, paddingVertical: 16 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    modalSearchContainer: { marginBottom: 16 },
    searchResultItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
    searchAvatar: { width: 44, height: 44, borderRadius: 22 },
    searchAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    searchUserInfo: { marginLeft: 12 },
    searchUsername: { fontSize: 16, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    searchHandle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
    noResults: { textAlign: 'center', paddingVertical: 20, fontFamily: 'Inter_400Regular' },
});
