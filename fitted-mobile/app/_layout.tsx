import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CustomSplashScreen } from '@/components/CustomSplashScreen';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_700Bold,
    Inter_900Black,
    ...FontAwesome.font,
  });

  const [appReady, setAppReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const initialize = useAuthStore((state) => state.initialize);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const segments = useSegments();
  const router = useRouter();

  // Initialize auth on app start
  useEffect(() => {
    initialize();
  }, []);

  // Handle auth redirects
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to auth if not authenticated
      router.replace('/auth');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isLoading]);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && !isLoading) {
      setAppReady(true);
      // Hide native splash screen immediately so our custom one takes over
      SplashScreen.hideAsync();
    }
  }, [loaded, isLoading]);

  if (!appReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutNav />
      {showSplash && (
        <CustomSplashScreen onAnimationFinish={() => setShowSplash(false)} />
      )}
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const { isDark } = useTheme();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post" options={{ headerShown: false }} />
        <Stack.Screen name="user" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
