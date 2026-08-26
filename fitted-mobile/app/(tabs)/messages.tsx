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
import PaymentCard from '@/components/PaymentCard';
import OutfitDeliveryCard from '@/components/OutfitDeliveryCard';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { blockUser, reportContent } from '@/services/moderation';
import StylingBookingModal from '@/components/StylingBookingModal';
import {
    cancelSession,
    formatRemaining,
    getOpenSession,
    remainingMs,
    startSession,
} from '@/services/stylingSessions';
import type { StylingSession } from '@/types';

// Height of the persistent header rendered above the tab content (see (tabs)/_layout.tsx).
// KeyboardAvoidingView measures its own position relative to its parent (not the screen),
// so it doesn't "see" this header — without offsetting by it, the input gets pushed up
// short of the keyboard's edge.
const HEADER_HEIGHT = 106;

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
    const sendFacePhoto = useMessagesStore((state) => state.sendFacePhoto);
    const sendImage = useMessagesStore((state) => state.sendImage);
    const setActiveConversation = useMessagesStore((state) => state.setActiveConversation);
    const createConversation = useMessagesStore((state) => state.createConversation);

    const [newMessage, setNewMessage] = useState('');
    const [showNewMessageModal, setShowNewMessageModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [searching, setSearching] = useState(false);
    const [conversationSearch, setConversationSearch] = useState('');
    const [showStylistModal, setShowStylistModal] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [session, setSession] = useState<StylingSession | null>(null);
    const [countdown, setCountdown] = useState(0);
    const flatListRef = useRef<FlatList>(null);

    // The open session for this conversation, kept live so both participants see
    // the same window. Realtime carries the status transitions the server makes.
    useEffect(() => {
        if (!activeConversation?.id) {
            setSession(null);
            return;
        }
        let cancelled = false;
        getOpenSession(activeConversation.id).then((found) => {
            if (!cancelled) setSession(found);
        });

        const channel = supabase
            .channel(`conversation:${activeConversation.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'styling_sessions',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, (payload) => {
                const next = payload.new as StylingSession | null;
                if (!next) return;
                // A finished session should stop rendering session UI.
                setSession(['completed', 'cancelled', 'expired'].includes(next.status) ? null : next);
            })
            // Without this the thread is frozen from the moment you open it: the
            // only other fetch happens when activeConversation changes. Refetching
            // rather than appending the payload row keeps the sender join and the
            // signed URLs for private media, which the raw row does not carry.
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, () => {
                fetchMessages(activeConversation.id);
            })
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, [activeConversation?.id, fetchMessages]);

    // Tick the visible countdown while a window is open.
    useEffect(() => {
        if (session?.status !== 'active') {
            setCountdown(0);
            return;
        }
        const tick = () => setCountdown(remainingMs(session));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [session?.status, session?.ends_at]);

    const isStylistForSession = !!session && session.stylist_id === user?.id;
    const sessionIsLive = session?.status === 'active' && countdown > 0;

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

    // Attach and send a photo in the conversation (available to any participant).
    // Offers either capturing a new photo or choosing one from the library.
    const handleSendPhoto = () => {
        if (!user || !activeConversation || imageUploading) return;

        Alert.alert(
            'Send Photo',
            undefined,
            [
                { text: 'Take Photo', onPress: () => pickAndSendPhoto('camera') },
                { text: 'Choose from Library', onPress: () => pickAndSendPhoto('library') },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    const pickAndSendPhoto = async (source: 'camera' | 'library') => {
        if (!user || !activeConversation || imageUploading) return;

        let result: ImagePicker.ImagePickerResult;
        if (source === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera access to take photos.');
                return;
            }
            result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
        } else {
            result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        }

        if (result.canceled || !result.assets[0]) return;

        setImageUploading(true);
        try {
            const ok = await sendImage(activeConversation.id, user.id, result.assets[0].uri);
            if (!ok) {
                Alert.alert('Upload Failed', 'Could not send the photo. Please try again.');
                return;
            }
            setTimeout(() => {
                flatListRef.current?.scrollToEnd();
            }, 100);
        } finally {
            setImageUploading(false);
        }
    };

    const handlePaymentAccept = async (messageId: string) => {
        void messageId;
        Alert.alert('Unavailable', 'Paid styling requests are not available in this release. No payment was processed.');
    };

    const handlePaymentDecline = async (messageId: string) => {
        void messageId;
        Alert.alert('Unavailable', 'This legacy payment request is inactive. No payment was processed.');
    };

    // Open the live window. Either participant can start it.
    const handleStartSession = async () => {
        if (!session) return;
        try {
            const started = await startSession(session.id);
            setSession(started);
        } catch (error: any) {
            Alert.alert('Could Not Start', error?.message || 'Please try again.');
        }
    };

    const handleCancelSession = () => {
        if (!session) return;
        Alert.alert(
            'Cancel Session?',
            'The hold on the card is released and nobody is charged.',
            [
                { text: 'Keep Session', style: 'cancel' },
                {
                    text: 'Cancel Session', style: 'destructive', onPress: async () => {
                        try {
                            await cancelSession(session.id);
                            setSession(null);
                        } catch (error: any) {
                            Alert.alert('Could Not Cancel', error?.message || 'Please try again.');
                        }
                    },
                },
            ],
        );
    };

    // Navigate stylist to create screen with client context. Only reachable
    // inside a live window, which is what makes this a real-time service.
    // Is there a board already in progress for this conversation?
    //
    // The action said "Create Outfit" whether or not work existed, so leaving
    // the screen and coming back looked like starting over -- and pressing it
    // did start over.
    const [stylingDraftId, setStylingDraftId] = useState<string | null>(null);

    useEffect(() => {
        if (!user || !activeConversation) { setStylingDraftId(null); return; }
        let cancelled = false;

        (async () => {
            const { data } = await supabase
                .from('drafts')
                .select('id')
                .eq('user_id', user.id)
                .eq('type', 'styling')
                .eq('data->>forConversation', activeConversation.id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!cancelled) setStylingDraftId(data?.id ?? null);
        })();

        return () => { cancelled = true; };
    }, [user, activeConversation?.id, messages.length]);

    const handleCreateOutfit = () => {
        if (!activeConversation || !session) return;
        const clientId = activeConversation.otherUser?.id;
        const clientName = activeConversation.otherUser?.username || 'Client';

        // Prefer a face the client shared into this conversation. The profile
        // photo is a last resort and may not be readable by the stylist.
        const faceMessage = [...messages].reverse().find(m => m.shared_face_url);
        const clientFaceUrl = faceMessage?.shared_face_url || '';

        router.push({
            pathname: '/(tabs)/create',
            params: {
                forConversation: activeConversation.id,
                forClientId: clientId,
                forClientName: clientName,
                forClientFaceUrl: clientFaceUrl,
                forSessionId: session.id,
                // Carries the stylist back into the board they had going rather
                // than a blank one. The styling context still comes from these
                // params; the draft only restores the canvas.
                ...(stylingDraftId ? { draftId: stylingDraftId } : {}),
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
    const showMessageActions = (item: Message & { sender: User }) => {
        if (!user || item.sender_id === user.id) return;
        Alert.alert('Message Options', 'Report this message or block its sender?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Report Message', onPress: async () => {
                    const result = await reportContent({ contentType: 'message', contentId: item.id, reportedUserId: item.sender_id, reason: 'Objectionable direct message' });
                    Alert.alert(result.error ? 'Could Not Report' : 'Report Received', result.error || 'Thank you. Our moderation team will review this message.');
                },
            },
            {
                text: 'Block Sender', style: 'destructive', onPress: async () => {
                    const result = await blockUser(item.sender_id);
                    if (result.error) return Alert.alert('Could Not Block User', result.error);
                    setActiveConversation(null);
                    await fetchConversations(user.id);
                    Alert.alert('User Blocked', 'They can no longer start or continue conversations with you.');
                },
            },
        ]);
    };

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

        // Photo message → render image bubble
        if (item.image_url) {
            return (
                <View style={[styles.imageBubble, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
                    <Image
                        source={{ uri: item.image_url }}
                        style={styles.imageBubbleImage}
                        contentFit="cover"
                    />
                    <Text style={[styles.messageTime, { color: colors.textTertiary, alignSelf: 'flex-end', marginTop: 4 }]}>
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
                    : { backgroundColor: colors.backgroundSecondary, borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
                // TEMPORARY, __DEV__ only. An incoming bubble is #f9fafb, which
                // is indistinguishable from the card's #ffffff in a screenshot.
                // Green tells the two apart.
                __DEV__ && { borderColor: 'limegreen', borderWidth: 2 }
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
                keyboardVerticalOffset={HEADER_HEIGHT}
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
                    renderItem={({ item }) => (
                        <Pressable onLongPress={() => showMessageActions(item as Message & { sender: User })} delayLongPress={350}>
                            {renderMessage({ item: item as Message & { sender: User } })}
                        </Pressable>
                    )}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
                    ListEmptyComponent={
                        <View style={styles.emptyMessages}>
                            <Text style={[styles.emptyMessagesText, { color: colors.textSecondary }]}>No messages yet</Text>
                            <Text style={[styles.emptyMessagesSubtext, { color: colors.textTertiary }]}>Say hello to start the convo!</Text>
                        </View>
                    }
                />

                {/* Session bar. This is the live window that makes paid styling a
                    real-time person-to-person service rather than async digital
                    content — the Create Outfit and Share Face actions only exist
                    while it is open. */}
                {session && (
                    <View style={[styles.sessionBar, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border }]}>
                        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                            <Text style={[styles.sessionTitle, { color: colors.text }]}>
                                {session.status === 'pending_payment' && 'Confirming payment…'}
                                {session.status === 'scheduled' && 'Session booked — ready to start'}
                                {session.status === 'active' && `Session live · ${formatRemaining(countdown)} left`}
                                {session.status === 'delivered' && 'Look delivered'}
                            </Text>
                            <Text style={[styles.sessionSubtitle, { color: colors.textSecondary }]}>
                                {isStylistForSession
                                    ? `with ${activeConversation.otherUser?.username || 'your client'}`
                                    : `with ${activeConversation.otherUser?.username || 'your stylist'}`}
                                {session.status === 'scheduled' ? ` · ${session.duration_minutes} min` : ''}
                            </Text>
                        </View>

                        {session.status === 'scheduled' && (
                            <>
                                <Pressable onPress={handleCancelSession} style={styles.sessionSecondary}>
                                    <Text style={[styles.sessionSecondaryText, { color: colors.textSecondary }]}>Cancel</Text>
                                </Pressable>
                                <Pressable onPress={handleStartSession}>
                                    <LinearGradient
                                        colors={['#6366f1', '#4f46e5']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.sessionAction}
                                    >
                                        <Text style={styles.sessionActionText}>Start</Text>
                                    </LinearGradient>
                                </Pressable>
                            </>
                        )}

                        {sessionIsLive && (
                            isStylistForSession ? (
                                <Pressable onPress={handleCreateOutfit}>
                                    <LinearGradient
                                        colors={['#6366f1', '#4f46e5']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.sessionAction}
                                    >
                                        <MaterialCommunityIcons name="palette" size={15} color="#fff" />
                                        <Text style={styles.sessionActionText}>{stylingDraftId ? 'Continue Outfit' : 'Create Outfit'}</Text>
                                    </LinearGradient>
                                </Pressable>
                            ) : (
                                <Pressable onPress={handleShareFace}>
                                    <LinearGradient
                                        colors={['#8b5cf6', '#7c3aed']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.sessionAction}
                                    >
                                        <Feather name="camera" size={14} color="#fff" />
                                        <Text style={styles.sessionActionText}>Share Face</Text>
                                    </LinearGradient>
                                </Pressable>
                            )
                        )}
                    </View>
                )}

                {/* Booking entry point: shown to a client talking to a verified
                    stylist when no session is already open. */}
                {!session && !isStylist && activeConversation.otherUser?.is_verified_stylist && (
                    <Pressable
                        onPress={() => setShowBookingModal(true)}
                        style={[styles.bookBar, { borderTopColor: colors.border }]}
                    >
                        <LinearGradient
                            colors={['#6366f1', '#4f46e5']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.bookButton}
                        >
                            <MaterialCommunityIcons name="hanger" size={16} color="#fff" />
                            <Text style={styles.bookButtonText}>
                                Book a styling session
                            </Text>
                        </LinearGradient>
                    </Pressable>
                )}

                {/* Input */}
                <View style={[styles.inputContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    {/* Photo Attach Button — available to any participant */}
                    <Pressable
                        style={[styles.attachButton, { backgroundColor: colors.backgroundSecondary }]}
                        onPress={handleSendPhoto}
                        disabled={imageUploading}
                    >
                        {imageUploading ? (
                            <ActivityIndicator size="small" color={colors.textSecondary} />
                        ) : (
                            <Feather name="image" size={20} color={colors.textSecondary} />
                        )}
                    </Pressable>

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

                {activeConversation.otherUser && (
                    <StylingBookingModal
                        visible={showBookingModal}
                        stylist={activeConversation.otherUser}
                        conversationId={activeConversation.id}
                        onClose={() => setShowBookingModal(false)}
                        onBooked={(booked) => {
                            setSession(booked);
                            setShowBookingModal(false);
                        }}
                    />
                )}
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
                                                : item.lastMessage?.image_url
                                                    ? '📷 Photo'
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

    // Live styling session bar
    sessionBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
    sessionTitle: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    sessionSubtitle: { fontSize: 11, marginTop: 1 },
    sessionAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 17 },
    sessionActionText: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: 'Inter_700Bold' },
    sessionSecondary: { paddingHorizontal: 10, paddingVertical: 8 },
    sessionSecondaryText: { fontSize: 13 },

    // Booking entry point
    bookBar: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
    bookButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, borderRadius: 20 },
    bookButtonText: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: 'Inter_700Bold' },

    inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1 },
    messageInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, borderWidth: 1, fontFamily: 'Inter_400Regular', paddingTop: 10 },
    sendButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },

    // Payment Button
    paymentButton: { marginRight: 8 },
    paymentButtonGradient: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

    // Photo Attach Button
    attachButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },

    // Image Message Bubble
    imageBubble: { maxWidth: '65%', marginBottom: 8 },
    imageBubbleImage: { width: 220, height: 220, borderRadius: 16 },

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
