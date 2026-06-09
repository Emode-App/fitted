import { Stack } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

function UserHeader() {
    const { colors } = useTheme();

    return (
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <Pressable style={styles.headerButton} onPress={() => router.back()}>
                <Feather name="arrow-left" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.logo, { color: colors.text }]}>EMODE.</Text>
            <View style={styles.headerButton} />
        </View>
    );
}

export default function UserLayout() {
    return (
        <View style={{ flex: 1 }}>
            <UserHeader />
            <Stack
                screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
    },
    headerButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        fontSize: 24,
        fontWeight: '900',
        fontFamily: 'Inter_900Black',
        letterSpacing: -1,
    },
});
