import React from 'react';
import {
    TouchableOpacity,
    Text,
    ActivityIndicator,
    TextInput,
    View,
    StyleSheet,
    Modal as RNModal,
    Platform,
    Pressable,
    TextInputProps,
    TouchableOpacityProps,
    ViewStyle,
    TextStyle
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInDown, ZoomIn } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { ThemeColors } from '@/constants/colors';

// --- BUTTON ---

interface ButtonProps extends TouchableOpacityProps {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destuctive';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    children?: React.ReactNode;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    isLoading,
    children,
    leftIcon,
    rightIcon,
    fullWidth,
    style,
    disabled,
    ...props
}) => {
    const { colors } = useTheme();

    const getVariantStyle = () => {
        switch (variant) {
            case 'primary':
                return { backgroundColor: colors.primary, activeOpacity: 0.8 };
            case 'secondary':
                return { backgroundColor: colors.secondary, activeOpacity: 0.7 };
            case 'outline':
                return { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, activeOpacity: 0.7 };
            case 'ghost':
                return { backgroundColor: 'transparent', activeOpacity: 0.6 };
            case 'destuctive':
                return { backgroundColor: colors.error, activeOpacity: 0.8 };
            default:
                return { backgroundColor: colors.primary };
        }
    };

    const getTextColor = () => {
        switch (variant) {
            case 'primary': return colors.primaryForeground;
            case 'secondary': return colors.secondaryForeground;
            case 'outline': return colors.text;
            case 'ghost': return colors.textSecondary;
            case 'destuctive': return '#ffffff';
            default: return colors.primaryForeground;
        }
    };

    const getSizeStyle = () => {
        switch (size) {
            case 'sm': return { height: 36, paddingHorizontal: 12, borderRadius: 10 };
            case 'md': return { height: 48, paddingHorizontal: 20, borderRadius: 14 };
            case 'lg': return { height: 56, paddingHorizontal: 24, borderRadius: 16 };
            case 'icon': return { width: 40, height: 40, paddingHorizontal: 0, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const };
            default: return { height: 48, paddingHorizontal: 20, borderRadius: 14 };
        }
    };

    const variantStyle = getVariantStyle();
    const sizeStyle = getSizeStyle();

    return (
        <TouchableOpacity
            style={[
                styles.buttonBase,
                variantStyle,
                sizeStyle,
                fullWidth && styles.fullWidth,
                disabled && styles.disabled,
                style
            ]}
            disabled={isLoading || disabled}
            activeOpacity={variantStyle.activeOpacity}
            {...props}
        >
            {isLoading ? (
                <ActivityIndicator color={getTextColor()} size="small" />
            ) : (
                <View style={styles.buttonContent}>
                    {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
                    {children && (
                        <Text style={[styles.buttonText, { color: getTextColor(), fontSize: size === 'sm' ? 13 : 15 }]}>
                            {children}
                        </Text>
                    )}
                    {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
                </View>
            )}
        </TouchableOpacity>
    );
};

// --- INPUT ---

interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    onRightIconPress?: () => void;
}

export const Input: React.FC<InputProps> = ({
    label,
    error,
    leftIcon,
    rightIcon,
    onRightIconPress,
    style,
    ...props
}) => {
    const { colors } = useTheme();

    return (
        <View style={styles.inputContainer}>
            {label && <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>}
            <View style={[
                styles.inputWrapper,
                {
                    backgroundColor: colors.input,
                    borderColor: error ? colors.error : colors.inputBorder,
                    borderWidth: 1
                }
            ]}>
                {leftIcon && <View style={styles.inputIconLeft}>{leftIcon}</View>}
                <TextInput
                    style={[styles.input, { color: colors.text }, style]}
                    placeholderTextColor={colors.placeholder}
                    {...props}
                />
                {rightIcon && (
                    <Pressable onPress={onRightIconPress} style={styles.inputIconRight}>
                        {rightIcon}
                    </Pressable>
                )}
            </View>
            {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}
        </View>
    );
};

// --- MODAL ---

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    variant?: 'center' | 'bottom';
    children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, variant = 'center', children }) => {
    const { colors } = useTheme();

    if (!isOpen) return null;

    return (
        <RNModal
            visible={isOpen}
            transparent
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
                <Pressable style={styles.overlay} onPress={onClose} />
            </BlurView>

            <View style={[
                variant === 'bottom' ? styles.modalContainerBottom : styles.modalContainerCenter,
                { pointerEvents: 'box-none' }
            ]}>
                {/* Modal Content */}
                <View style={[
                    variant === 'bottom' ? styles.modalContentBottom : styles.modalContentCenter,
                    { backgroundColor: colors.background, borderColor: colors.border }
                ]}>
                    {variant === 'bottom' && <View style={styles.dragIndicator} />}

                    {(title || variant === 'center') && (
                        <View style={styles.modalHeader}>
                            {title && <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>}
                            {variant === 'center' && (
                                <Pressable onPress={onClose} style={styles.closeButton}>
                                    <Feather name="x" size={20} color={colors.textSecondary} />
                                </Pressable>
                            )}
                        </View>
                    )}

                    <View style={styles.modalBody}>
                        {children}
                    </View>
                </View>
            </View>
        </RNModal>
    );
};

const styles = StyleSheet.create({
    // Button
    buttonBase: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullWidth: {
        width: '100%',
    },
    disabled: {
        opacity: 0.5,
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonText: {
        fontWeight: '600',
        fontFamily: 'Inter_600SemiBold',
    },
    leftIcon: {
        marginRight: 8,
    },
    rightIcon: {
        marginLeft: 8,
    },

    // Input
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        marginBottom: 6,
        fontWeight: '500',
        fontFamily: 'Inter_500Medium',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 48, // Standard height
    },
    input: {
        flex: 1,
        height: '100%',
        fontFamily: 'Inter_400Regular',
        fontSize: 15,
    },
    inputIconLeft: {
        marginRight: 10,
    },
    inputIconRight: {
        marginLeft: 10,
    },
    errorText: {
        fontSize: 12,
        marginTop: 4,
        fontFamily: 'Inter_400Regular',
    },

    // Modal
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    modalContainerCenter: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        pointerEvents: 'box-none',
    },
    modalContainerBottom: {
        flex: 1,
        justifyContent: 'flex-end',
        pointerEvents: 'box-none',
    },
    modalContentCenter: {
        borderRadius: 24,
        width: '100%',
        maxWidth: 340,
        padding: 24,
        borderWidth: 1,
        elevation: 10,
        boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.1)',
    },
    modalContentBottom: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        width: '100%',
        padding: 24,
        paddingBottom: 40,
        borderWidth: 1,
        borderBottomWidth: 0,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
    },
    closeButton: {
        padding: 4,
    },
    modalBody: {
        width: '100%',
    },
    dragIndicator: {
        width: 40,
        height: 4,
        backgroundColor: '#e4e4e7',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
        marginTop: -10,
    },
});
