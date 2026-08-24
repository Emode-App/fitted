import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-reanimated';
import { Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { onboardingKeyFor } from './onboarding';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { initializeRevenueCat, identifyUser } from '@/services/revenueCatService';
import { initMonitoring, withMonitoring, setMonitoringUser } from '@/services/monitoring';
import { addNotificationResponseListener } from '@/services/pushNotifications';
import AppStripeProvider from '@/components/AppStripeProvider';
import { applySupabaseAuthLink } from '@/services/authLinks';

// Initialize crash/error reporting before anything else runs. No-op in Expo Go
// or without EXPO_PUBLIC_SENTRY_DSN set.
initMonitoring();

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CustomSplashScreen } from '@/components/CustomSplashScreen';

function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_700Bold,
    Inter_900Black,
    ...FontAwesome.font,
  });

  const [appReady, setAppReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  // A launch that came from an email link carries a session that has not been
  // exchanged yet. Without holding the gate for it, the redirect runs first,
  // decides nobody is signed in, and drops a freshly confirmed account on the
  // sign in screen -- which then has to be signed into by hand.
  const [authLinkPending, setAuthLinkPending] = useState(true);

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

  // Identify user with RevenueCat + Sentry when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      identifyUser(user.id).catch(() => {});
      setMonitoringUser({ id: user.id });
    } else {
      setMonitoringUser(null);
    }
  }, [isAuthenticated, user?.id]);

  // Route to Activity when an order push is tapped (also handles cold starts).
  useEffect(() => {
    const unsubscribe = addNotificationResponseListener((data) => {
      if (data?.type === 'order_sold' || data?.type === 'order_shipped') {
        router.push('/activity');
      }
    });
    return unsubscribe;
  }, []);

  // Timeout fallback for web to prevent permanent white screen
  useEffect(() => {
    // Never let the hold outlive the thing it is waiting for. This flag gates
    // every redirect in the app, so a promise that does not settle would leave
    // the whole thing parked on a blank route with no way out.
    const release = setTimeout(() => setAuthLinkPending(false), 2500);

    Linking.getInitialURL()
      .then((url) => applySupabaseAuthLink(url))
      .catch(() => {})
      .finally(() => {
        clearTimeout(release);
        setAuthLinkPending(false);
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      // A link arriving while the app is open holds the gate the same way, so a
      // confirmation tapped from the background lands on onboarding too.
      setAuthLinkPending(true);
      applySupabaseAuthLink(url)
        .catch(() => {})
        .finally(() => setAuthLinkPending(false));
    });
    return () => {
      clearTimeout(release);
      subscription.remove();
    };
  }, []);

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
    if ((isLoading || authLinkPending) && !timedOut) return;

    const checkRedirect = async () => {
      const inAuthGroup = segments[0] === 'auth';
      const inOnboarding = segments[0] === 'onboarding';
      const inPasswordReset = (segments[0] as string | undefined) === 'reset-password';

      if (!isAuthenticated) {
        if (!inAuthGroup && !inPasswordReset) {
          router.replace('/auth');
        }
        return;
      }

      // Signed in but the profile has not arrived yet — or its fetch failed, which
      // leaves isAuthenticated true and user null. Either way we do not yet know
      // whether this account has onboarded, and guessing sends someone who
      // finished months ago back through it. Wait for the profile instead; this
      // effect re-runs when it lands.
      if (!user) return;

      // Onboarding is a fact about the account, so the server value decides. The
      // device flag is only a cache for the moment before the profile loads --
      // relying on it alone is what made every account switch, reinstall and new
      // phone replay onboarding for people who had long since finished it.
      const hasOnboarded =
        !!user.onboarded_at ||
        (await AsyncStorage.getItem(onboardingKeyFor(user.id))) === 'true';

      if (!hasOnboarded && !inOnboarding) {
        router.replace('/onboarding');
      } else if (hasOnboarded && (inAuthGroup || inOnboarding)) {
        router.replace('/(tabs)');
      }
    };

    checkRedirect();
  }, [isAuthenticated, segments, isLoading, authLinkPending, timedOut, user, user?.onboarded_at, user?.id]);

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

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutNav />
      {showSplash && (
        <CustomSplashScreen onAnimationFinish={() => setShowSplash(false)} />
      )}
    </GestureHandlerRootView>
  );

  return <AppStripeProvider>{content}</AppStripeProvider>;
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
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post" options={{ headerShown: false }} />
        <Stack.Screen name="user" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

// Wrap with Sentry so render errors and profiling are captured (no-op when
// monitoring is disabled, e.g. Expo Go or no DSN).
export default withMonitoring(RootLayout);
