import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { PaymentRequest } from '@/types';

interface PaymentCardProps {
    paymentRequest: PaymentRequest;
    isOwnMessage: boolean; // did the current user send this payment request?
    onAccept?: () => void;
    onDecline?: () => void;
    onCreateOutfit?: () => void; // stylist: navigate to create screen
    onShareFace?: () => void; // client: share face photo for styling
    timestamp: string;
}

export default function PaymentCard({ paymentRequest, isOwnMessage, onAccept, onDecline, onCreateOutfit, onShareFace, timestamp }: PaymentCardProps) {
    const { colors, isDark } = useTheme();
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const isPending = paymentRequest.status === 'pending';
    const isCompleted = paymentRequest.status === 'completed';
    const isFailed = paymentRequest.status === 'failed'; // declined

    // Gentle pulse animation for pending state
    useEffect(() => {
        if (isPending && !isOwnMessage) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.02,
                        duration: 1500,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1500,
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        }
    }, [isPending, isOwnMessage]);

    const formatTime = (ts: string): string => {
        const date = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'now';
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        return date.toLocaleDateString();
    };

    // Status config
    const statusConfig = {
        pending: {
            label: 'Pending',
            icon: 'clock' as const,
            color: '#f59e0b',
            bgColor: 'rgba(245, 158, 11, 0.12)',
        },
        completed: {
            label: 'Paid',
            icon: 'check-circle' as const,
            color: '#10b981',
            bgColor: 'rgba(16, 185, 129, 0.12)',
        },
        failed: {
            label: 'Declined',
            icon: 'x-circle' as const,
            color: '#ef4444',
            bgColor: 'rgba(239, 68, 68, 0.12)',
        },
    };

    const status = statusConfig[paymentRequest.status] || statusConfig.pending;

    // Card border color based on status
    const borderColor = isPending
        ? (isDark ? '#374151' : '#e5e7eb')
        : isCompleted
            ? 'rgba(16, 185, 129, 0.3)'
            : 'rgba(239, 68, 68, 0.2)';

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
                    transform: [{ scale: pulseAnim }],
                }
            ]}
        >
            <View style={[
                styles.card,
                {
                    backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                    borderColor,
                    shadowColor: isCompleted ? '#10b981' : '#000',
                }
            ]}>
                {/* Header Row */}
                <View style={styles.headerRow}>
                    <View style={[styles.iconCircle, { backgroundColor: status.bgColor }]}>
                        <MaterialCommunityIcons
                            name={isPending ? 'cash-fast' : isCompleted ? 'cash-check' : 'cash-remove'}
                            size={18}
                            color={status.color}
                        />
                    </View>
                    <View style={styles.headerText}>
                        <Text style={[styles.headerLabel, { color: colors.textSecondary }]}>
                            {isOwnMessage ? 'You requested' : 'Payment Request'}
                        </Text>
                    </View>
                    {/* Status Badge */}
                    <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                        <Feather name={status.icon} size={11} color={status.color} />
                        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                </View>

                {/* Amount */}
                <View style={styles.amountSection}>
                    <Text style={[styles.amountText, { color: colors.text }]}>
                        ${paymentRequest.amount.toFixed(2)}
                    </Text>
                    <Text style={[styles.currencyLabel, { color: colors.textTertiary }]}>
                        {paymentRequest.currency}
                    </Text>
                </View>

                {/* Description */}
                {paymentRequest.description ? (
                    <View style={[styles.descriptionBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                        <Feather name="file-text" size={13} color={colors.textTertiary} />
                        <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                            {paymentRequest.description}
                        </Text>
                    </View>
                ) : null}

                {/* Action Buttons — only show for recipient on pending requests */}
                {!isOwnMessage && isPending && (
                    <View style={styles.actionRow}>
                        <Pressable
                            style={[styles.declineButton, { borderColor: colors.border }]}
                            onPress={onDecline}
                        >
                            <Feather name="x" size={15} color={colors.textSecondary} />
                            <Text style={[styles.declineText, { color: colors.textSecondary }]}>Decline</Text>
                        </Pressable>

                        <Pressable
                            style={styles.acceptButtonWrapper}
                            onPress={onAccept}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.acceptButton}
                            >
                                <MaterialCommunityIcons name="check" size={16} color="#fff" />
                                <Text style={styles.acceptText}>Accept & Pay</Text>
                            </LinearGradient>
                        </Pressable>
                    </View>
                )}

                {/* Transaction ID for completed payments */}
                {isCompleted && paymentRequest.transaction_id && (
                    <View style={styles.transactionRow}>
                        <Feather name="hash" size={10} color={colors.textTertiary} />
                        <Text style={[styles.transactionText, { color: colors.textTertiary }]}>
                            {paymentRequest.transaction_id}
                        </Text>
                    </View>
                )}

                {/* Post-payment actions — show after payment is completed */}
                {isCompleted && (
                    <View style={styles.postPaymentRow}>
                        {isOwnMessage && onCreateOutfit && (
                            <Pressable style={styles.createOutfitWrapper} onPress={onCreateOutfit}>
                                <LinearGradient
                                    colors={['#6366f1', '#4f46e5']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.postPaymentButton}
                                >
                                    <MaterialCommunityIcons name="palette" size={15} color="#fff" />
                                    <Text style={styles.postPaymentButtonText}>Create Outfit</Text>
                                </LinearGradient>
                            </Pressable>
                        )}
                        {!isOwnMessage && onShareFace && (
                            <Pressable style={styles.shareFaceWrapper} onPress={onShareFace}>
                                <LinearGradient
                                    colors={['#8b5cf6', '#7c3aed']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.postPaymentButton}
                                >
                                    <Feather name="camera" size={14} color="#fff" />
                                    <Text style={styles.postPaymentButtonText}>Share Face Photo</Text>
                                </LinearGradient>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* Timestamp */}
                <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
                    {formatTime(timestamp)}
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        maxWidth: '85%',
        marginBottom: 10,
    },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 16,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    // Header
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    iconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: {
        flex: 1,
        marginLeft: 10,
    },
    headerLabel: {
        fontSize: 13,
        fontWeight: '500',
        fontFamily: 'Inter_500Medium',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        gap: 4,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    // Amount
    amountSection: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 10,
        gap: 6,
    },
    amountText: {
        fontSize: 32,
        fontWeight: '900',
        fontFamily: 'Inter_900Black',
        letterSpacing: -1,
    },
    currencyLabel: {
        fontSize: 14,
        fontWeight: '500',
        fontFamily: 'Inter_500Medium',
        textTransform: 'uppercase',
    },
    // Description
    descriptionBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 10,
        borderRadius: 10,
        gap: 8,
        marginBottom: 14,
    },
    descriptionText: {
        fontSize: 13,
        flex: 1,
        lineHeight: 18,
        fontFamily: 'Inter_500Medium',
    },
    // Actions
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 2,
    },
    declineButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
        gap: 6,
    },
    declineText: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    acceptButtonWrapper: {
        flex: 1.5,
    },
    acceptButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: 12,
        gap: 6,
    },
    acceptText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    // Transaction
    transactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 6,
    },
    transactionText: {
        fontSize: 10,
        fontFamily: 'Inter_400Regular',
    },
    // Timestamp
    timestamp: {
        fontSize: 10,
        marginTop: 8,
        alignSelf: 'flex-end',
        fontFamily: 'Inter_400Regular',
    },
    // Post-payment actions
    postPaymentRow: {
        marginTop: 10,
        gap: 8,
    },
    createOutfitWrapper: {
        width: '100%',
    },
    shareFaceWrapper: {
        width: '100%',
    },
    postPaymentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        gap: 6,
    },
    postPaymentButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
});
