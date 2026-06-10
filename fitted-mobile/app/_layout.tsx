import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-reanimated';
import { Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { ONBOARDING_KEY } from './onboarding';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { STRIPE_CONFIG } from '@/constants/payments';
import { initializeRevenueCat, identifyUser } from '@/services/revenueCatService';

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
  const [timedOut, setTimedOut] = useState(false);

  const initialize = useAuthStore((state) => state.initialize);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  const segments = useSegments();
  const router = useRouter();

  // Initialize auth on app start
  useEffect(() => {
    initialize();
    // Initialize RevenueCat (gracefully fails in Expo Go)
    initializeRevenueCat().catch(() => {});
  }, []);

  // Identify user with RevenueCat when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      identifyUser(user.id).catch(() => {});
    }
  }, [isAuthenticated, user?.id]);

  // Timeout fallback for web to prevent permanent white screen
  useEffect(() => {
    if (Platform.OS === 'web') {
      console.log('[Layout] Setting up 3s timeout fallback for web');
      const timeout = setTimeout(() => {
        console.log('[Layout] Timeout fired, setting timedOut=true');
        setTimedOut(true);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, []); // Empty deps - run once on mount

  // Handle auth + onboarding redirects
  useEffect(() => {
    if (isLoading && !timedOut) return;

    const checkRedirect = async () => {
      const inAuthGroup = segments[0] === 'auth';
      const inOnboarding = segments[0] === 'onboarding';

      if (!isAuthenticated) {
        if (!inAuthGroup) {
          router.replace('/auth');
        }
        return;
      }

      const hasOnboarded = (await AsyncStorage.getItem(ONBOARDING_KEY)) === 'true';

      if (!hasOnboarded && !inOnboarding) {
        router.replace('/onboarding');
      } else if (hasOnboarded && (inAuthGroup || inOnboarding)) {
        router.replace('/(tabs)');
      }
    };

    checkRedirect();
  }, [isAuthenticated, segments, isLoading, timedOut]);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    const fontsReady = loaded || timedOut;
    const authReady = !isLoading || timedOut;

    if (fontsReady && authReady) {
      setAppReady(true);
      // Hide native splash screen immediately so our custom one takes over
      SplashScreen.hideAsync();
    }
  }, [loaded, isLoading, timedOut]);

  if (!appReady) {
    return null;
  }

  // Dynamically check if StripeProvider is available (dev builds only)
  let StripeProvider: any = null;
  try {
    const stripeMod = require('@stripe/stripe-react-native');
    StripeProvider = stripeMod.StripeProvider;
  } catch {
    // @stripe/stripe-react-native not installed or not available in Expo Go
  }

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutNav />
      {showSplash && (
        <CustomSplashScreen onAnimationFinish={() => setShowSplash(false)} />
      )}
    </GestureHandlerRootView>
  );

  // Wrap with StripeProvider if available (dev builds)
  if (StripeProvider && STRIPE_CONFIG.publishableKey) {
    return (
      <StripeProvider
        publishableKey={STRIPE_CONFIG.publishableKey}
        urlScheme={STRIPE_CONFIG.urlScheme}
        merchantIdentifier={STRIPE_CONFIG.merchantIdentifier}
      >
        {content}
      </StripeProvider>
    );
  }

  return content;
}

function RootLayoutNav() {
  const { isDark, colors } = useTheme();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.background,
      border: colors.border,
      text: colors.text,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post" options={{ headerShown: false }} />
        <Stack.Screen name="user" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
