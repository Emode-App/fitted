// Crash + error reporting via Sentry.
//
// Safe by design: this is a complete no-op in Expo Go (no native module) and
// when no DSN is configured, so it never breaks local development. In a dev/
// production build with EXPO_PUBLIC_SENTRY_DSN set, it reports unhandled crashes
// automatically plus anything passed to captureException/captureMessage.
//
// Set the DSN in .env.local:  EXPO_PUBLIC_SENTRY_DSN=https://...ingest.sentry.io/...

import Constants from 'expo-constants';

// Native module is absent in Expo Go — require defensively.
let Sentry: any = null;
try {
    Sentry = require('@sentry/react-native');
} catch {
    Sentry = null;
}

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
const isExpoGo = Constants.appOwnership === 'expo';

// Only enable when we have a native SDK, a DSN, and aren't in Expo Go.
const ENABLED = !!Sentry && !!DSN && !isExpoGo;

/** Call once, as early as possible (top of the root layout module). */
export function initMonitoring(): void {
    if (!ENABLED) return;
    try {
        Sentry.init({
            dsn: DSN,
            environment: __DEV__ ? 'development' : 'production',
            // Performance tracing sample rate — dial down if it gets noisy/costly.
            tracesSampleRate: __DEV__ ? 1.0 : 0.2,
            // Don't attach IPs / cookies; we set a hashed user id explicitly below.
            sendDefaultPii: false,
        });
    } catch (e) {
        console.warn('Sentry init failed:', e);
    }
}

/** Report a handled error from a critical flow (payments, AI, etc.). */
export function captureException(error: unknown, context?: Record<string, any>): void {
    if (ENABLED) {
        try {
            Sentry.captureException(error, context ? { extra: context } : undefined);
            return;
        } catch {
            // fall through to console
        }
    }
    console.error('[capture]', error, context ?? '');
}

/** Report a noteworthy non-error event ("points award failed", etc.). */
export function captureMessage(message: string, context?: Record<string, any>): void {
    if (ENABLED) {
        try {
            Sentry.captureMessage(message, context ? { extra: context } : undefined);
            return;
        } catch {
            // fall through to console
        }
    }
    console.warn('[capture]', message, context ?? '');
}

/** Associate subsequent events with the signed-in user (id only — no PII). */
export function setMonitoringUser(user: { id: string } | null): void {
    if (!ENABLED) return;
    try {
        Sentry.setUser(user ? { id: user.id } : null);
    } catch {
        // ignore
    }
}

/**
 * Wrap the root component so Sentry can capture render errors and touch/profiling
 * data. No-op (returns the component unchanged) when monitoring is disabled.
 */
export function withMonitoring<T>(component: T): T {
    if (ENABLED && typeof Sentry.wrap === 'function') {
        try {
            return Sentry.wrap(component);
        } catch {
            return component;
        }
    }
    return component;
}
