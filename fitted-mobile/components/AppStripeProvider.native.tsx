import { useEffect, useState, type ReactElement } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StripeProvider } from '@stripe/stripe-react-native';

import { STRIPE_CONFIG } from '@/constants/payments';
import { supabase } from '@/services/supabase';

/**
 * Configures Stripe with a key the server chooses.
 *
 * The compiled-in EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is now only a fallback.
 * It used to be the whole story, which meant switching Stripe from test to live
 * was a native build -- and switching back was another one. Asking the server
 * makes that a secret change, reversible in seconds, which matters most during
 * a launch when the ability to undo is worth more than the ability to do.
 *
 * Three sources, in the order they become available:
 *
 *   1. the compiled-in key, so there is never a moment with no configuration
 *   2. the last key the server gave, from storage, so a cold start is not stuck
 *      on a stale fallback while the network answers -- or offline, where it
 *      would otherwise silently fall back to test against a live server
 *   3. the server, which is authoritative and overrides both
 *
 * Changing publishableKey re-initialises StripeProvider. That is fine here:
 * this resolves within a second of launch, long before anything can be paid
 * for, and a payment sheet in flight would have to survive the app restarting
 * to notice.
 */

const CACHED_KEY = 'stripe:publishable-key';

export default function AppStripeProvider({ children }: { children: ReactElement | ReactElement[] }) {
    const [publishableKey, setPublishableKey] = useState(STRIPE_CONFIG.publishableKey);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const cached = await AsyncStorage.getItem(CACHED_KEY);
                if (cached && !cancelled) setPublishableKey(cached);
            } catch {
                // No cache is not a problem; the fallback is already in place.
            }

            try {
                const { data, error } = await supabase.functions.invoke('payment-config');
                const fresh = typeof data?.publishableKey === 'string' ? data.publishableKey : '';
                if (cancelled || error || !fresh) return;

                setPublishableKey(fresh);
                AsyncStorage.setItem(CACHED_KEY, fresh).catch(() => {});
            } catch {
                // Offline, or the function is not deployed. Whatever is already
                // configured stays, which is the compiled-in key on a first run
                // and the last known server key on any run after that.
            }
        })();

        return () => { cancelled = true; };
    }, []);

    if (!publishableKey) return children;

    return (
        <StripeProvider
            publishableKey={publishableKey}
            urlScheme={STRIPE_CONFIG.urlScheme}
            merchantIdentifier={STRIPE_CONFIG.merchantIdentifier}
        >
            {children}
        </StripeProvider>
    );
}
