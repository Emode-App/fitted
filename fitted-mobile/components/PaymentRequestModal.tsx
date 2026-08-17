import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

interface PaymentRequestModalProps {
    visible: boolean;
    onClose: () => void;
    onSend: (amount: number, description: string) => void;
    recipientName: string;
}

export default function PaymentRequestModal({ visible, onClose, onSend, recipientName }: PaymentRequestModalProps) {
    const { colors, isDark } = useTheme();
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const slideAnim = useRef(new Animated.Value(0)).current;
    const amountInputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 1,
                useNativeDriver: Platform.OS !== 'web',
                tension: 65,
                friction: 11,
            }).start();
            // Auto-focus amount input
            setTimeout(() => amountInputRef.current?.focus(), 300);
        } else {
            slideAnim.setValue(0);
            setAmount('');
            setDescription('');
            setError('');
        }
    }, [visible]);

    const formatAmount = (text: string): string => {
        // Strip non-numeric except decimal
        const cleaned = text.replace(/[^0-9.]/g, '');
        // Only allow one decimal point
        const parts = cleaned.split('.');
        if (parts.length > 2) return amount;
        // Limit to 2 decimal places
        if (parts[1] && parts[1].length > 2) return amount;
        return cleaned;
    };

    const handleAmountChange = (text: string) => {
        const formatted = formatAmount(text);
        setAmount(formatted);
        setError('');
    };

    const handleSend = () => {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount < 1) {
            setError('Minimum amount is $1.00');
            return;
        }
        if (numAmount > 10000) {
            setError('Maximum amount is $10,000.00');
            return;
        }
        if (!description.trim()) {
            setError('Please add a description');
            return;
        }
        onSend(numAmount, description.trim());
        onClose();
    };

    const numericAmount = parseFloat(amount) || 0;
    const isValid = numericAmount >= 1 && numericAmount <= 10000 && description.trim().length > 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <BlurView intensity={30} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <Animated.View
                    style={[
                        styles.modalContent,
                        {
                            backgroundColor: colors.background,
                            transform: [{
                                translateY: slideAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [300, 0],
                                })
                            }],
                        }
                    ]}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <Pressable style={styles.closeButton} onPress={onClose}>
                            <Feather name="x" size={22} color={colors.textSecondary} />
                        </Pressable>
                        <View style={styles.headerCenter}>
                            <MaterialCommunityIcons name="cash-fast" size={20} color="#10b981" />
                            <Text style={[styles.headerTitle, { color: colors.text }]}>Request Payment</Text>
                        </View>
                        <View style={{ width: 32 }} />
                    </View>

                    {/* Recipient */}
                    <Text style={[styles.recipientText, { color: colors.textSecondary }]}>
                        Requesting from <Text style={{ color: colors.text, fontWeight: '700' }}>{recipientName}</Text>
                    </Text>

                    {/* Amount Input */}
                    <View style={styles.amountSection}>
                        <View style={styles.amountRow}>
                            <Text style={[styles.currencySymbol, { color: colors.textTertiary }]}>$</Text>
                            <TextInput
                                ref={amountInputRef}
                                style={[styles.amountInput, { color: colors.text }]}
                                placeholder="0.00"
                                placeholderTextColor={colors.textTertiary}
                                value={amount}
                                onChangeText={handleAmountChange}
                                keyboardType="decimal-pad"
                                maxLength={8}
                            />
                        </View>
                        <View style={[styles.amountUnderline, { backgroundColor: amount ? '#10b981' : colors.border }]} />
                    </View>

                    {/* Description Input */}
                    <View style={[styles.descriptionContainer, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                        <Feather name="file-text" size={16} color={colors.textTertiary} style={{ marginTop: 2 }} />
                        <TextInput
                            style={[styles.descriptionInput, { color: colors.text }]}
                            placeholder="What's this for? (e.g., Full outfit styling)"
                            placeholderTextColor={colors.textTertiary}
                            value={description}
                            onChangeText={(text) => {
                                setDescription(text);
                                setError('');
                            }}
                            multiline
                            maxLength={200}
                        />
                    </View>

                    {/* Quick Amount Buttons */}
                    <View style={styles.quickAmounts}>
                        {[25, 50, 75, 100].map((quickAmount) => (
                            <Pressable
                                key={quickAmount}
                                style={[
                                    styles.quickAmountButton,
                                    {
                                        backgroundColor: numericAmount === quickAmount
                                            ? 'rgba(16, 185, 129, 0.15)'
                                            : colors.backgroundSecondary,
                                        borderColor: numericAmount === quickAmount
                                            ? '#10b981'
                                            : colors.border,
                                    }
                                ]}
                                onPress={() => {
                                    setAmount(quickAmount.toString());
                                    setError('');
                                }}
                            >
                                <Text style={[
                                    styles.quickAmountText,
                                    {
                                        color: numericAmount === quickAmount ? '#10b981' : colors.textSecondary
                                    }
                                ]}>
                                    ${quickAmount}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {/* Error Message */}
                    {error ? (
                        <View style={styles.errorContainer}>
                            <Feather name="alert-circle" size={14} color="#ef4444" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    {/* Send Button */}
                    <Pressable
                        onPress={handleSend}
                        disabled={!isValid}
                        style={styles.sendButtonWrapper}
                    >
                        <LinearGradient
                            colors={isValid ? ['#10b981', '#059669'] : [colors.backgroundTertiary, colors.backgroundTertiary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.sendButton, !isValid && { opacity: 0.5 }]}
                        >
                            <MaterialCommunityIcons
                                name="send"
                                size={18}
                                color={isValid ? '#fff' : colors.textTertiary}
                                style={{ marginRight: 8 }}
                            />
                            <Text style={[
                                styles.sendButtonText,
                                { color: isValid ? '#fff' : colors.textTertiary }
                            ]}>
                                {numericAmount > 0 ? `Request $${numericAmount.toFixed(2)}` : 'Request Payment'}
                            </Text>
                        </LinearGradient>
                    </Pressable>

                    {/* Security Note */}
                    <View style={styles.securityNote}>
                        <Feather name="shield" size={12} color={colors.textTertiary} />
                        <Text style={[styles.securityText, { color: colors.textTertiary }]}>
                            Payments are secured and processed within Emode
                        </Text>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalContent: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 8,
        boxShadow: '0px -8px 24px rgba(0, 0, 0, 0.15)',
        elevation: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
    },
    closeButton: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    recipientText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        fontFamily: 'Inter_500Medium',
    },
    amountSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    currencySymbol: {
        fontSize: 36,
        fontWeight: '300',
        fontFamily: 'Inter_400Regular',
        marginRight: 4,
    },
    amountInput: {
        fontSize: 48,
        fontWeight: '800',
        fontFamily: 'Inter_900Black',
        minWidth: 100,
        textAlign: 'center',
    },
    amountUnderline: {
        width: 120,
        height: 3,
        borderRadius: 2,
        marginTop: 8,
    },
    descriptionContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 16,
        gap: 10,
    },
    descriptionInput: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Inter_500Medium',
        maxHeight: 80,
        lineHeight: 20,
    },
    quickAmounts: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 20,
    },
    quickAmountButton: {
        paddingVertical: 8,
        paddingHorizontal: 18,
        borderRadius: 20,
        borderWidth: 1,
    },
    quickAmountText: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 16,
    },
    errorText: {
        fontSize: 13,
        color: '#ef4444',
        fontFamily: 'Inter_500Medium',
    },
    sendButtonWrapper: {
        width: '100%',
    },
    sendButton: {
        width: '100%',
        height: 54,
        borderRadius: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonText: {
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    securityNote: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 16,
    },
    securityText: {
        fontSize: 11,
        fontFamily: 'Inter_400Regular',
    },
});
