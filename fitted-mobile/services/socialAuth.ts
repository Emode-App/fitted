import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { supabase } from '@/services/supabase';
import { LEGAL } from '@/constants/legal';

/**
 * Signing in with an account somebody already has.
 *
 * Two providers, deliberately by different routes.
 *
 * Apple is native. Its own sheet is the experience people expect, it is the one
 * Apple reviews against, and expo-apple-authentication hands back an identity
 * token that Supabase verifies directly -- no client id in the app, no redirect.
 *
 * Google is native for the same reason, and for one more. Supabase can run the
 * flow in a browser instead, which needs no client id in the app -- but it puts
 * scvvbjheyfnxlsiiozta.supabase.co in the address bar, and Google's own consent
 * screen then reads "to continue to scvvbjheyfnxlsiiozta.supabase.co". Nobody
 * signing into emode should be shown the name of its database. The native sheet
 * shows no URL at all.
 *
 * The cost is an iOS client id at build time, which app.config.js requires
 * before it will even add the plugin.
 */

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/**
 * The Google Sign-In package, loaded only if this binary actually contains it.
 *
 * This was a top-level import once, and it took the entire sign-in screen down
 * with it. The package reaches for its native module the moment it is required
 * -- TurboModuleRegistry.getEnforcing('RNGoogleSignin') throws rather than
 * returning null -- so on a binary built before that module existed, the throw
 * escaped this file, into app/auth.tsx which imports it, and into expo-router's
 * route scan, which evaluates every route file at startup. The symptom was not
 * "Google sign-in is unavailable". It was "there is no auth route": signing out
 * navigated to /auth and landed on Unmatched Route, with no way back in.
 *
 * It would be tempting to file that under stale dev builds. It is not: JS ships
 * over the air ahead of native code, so the same crash reaches anyone who takes
 * an update while running an older binary. Requiring it lazily inside a try
 * means a missing native module hides the Google button, which is the behaviour
 * this file claimed to have all along.
 */
type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

// undefined = not tried yet, null = tried and not present in this binary.
let googleModule: GoogleSignInModule | null | undefined;

function loadGoogleModule(): GoogleSignInModule | null {
    if (googleModule !== undefined) return googleModule;
    try {
        googleModule = require('@react-native-google-signin/google-signin');
    } catch {
        googleModule = null;
    }
    return googleModule ?? null;
}

let googleConfigured = false;

/**
 * Whether Google sign-in can run.
 *
 * Both ids are needed and they do different jobs: the iOS one identifies the
 * app to Google, and the web one is the audience Supabase checks the returned
 * token against. With only the first, sign-in succeeds at Google and is then
 * rejected here -- which is worse than not offering it.
 */
export function isGoogleAuthAvailable(): boolean {
    return !!GOOGLE_IOS_CLIENT_ID && !!GOOGLE_WEB_CLIENT_ID && !!loadGoogleModule();
}

/** Configures the SDK on first use and hands back the module. */
function ensureGoogleConfigured(): GoogleSignInModule {
    const module = loadGoogleModule();
    if (!module) throw new Error('Google sign-in is not available in this build');

    if (!googleConfigured) {
        module.GoogleSignin.configure({
            iosClientId: GOOGLE_IOS_CLIENT_ID,
            webClientId: GOOGLE_WEB_CLIENT_ID,
        });
        googleConfigured = true;
    }
    return module;
}

export type SocialProvider = 'apple' | 'google';

export interface SocialAuthResult {
    /** True when this sign-in created the account rather than returning to one. */
    isNewUser: boolean;
}

/** Whether Sign in with Apple can run at all. iOS 13+, and never on Android. */
export async function isAppleAuthAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
        return await AppleAuthentication.isAvailableAsync();
    } catch {
        return false;
    }
}

/**
 * Records that this person accepted the terms.
 *
 * Password sign-up sends terms_accepted through the sign-up metadata, which
 * handle_new_user reads. An identity token carries no metadata of ours, so
 * without this an account made through Apple or Google would have no record of
 * accepting anything -- and the screen does gate on it.
 */
async function recordTermsAcceptance(userId: string): Promise<void> {
    const { error } = await supabase
        .from('private_users')
        .update({
            terms_accepted_at: new Date().toISOString(),
            terms_version: LEGAL.termsVersion,
        })
        .eq('id', userId)
        .is('terms_accepted_at', null);

    // Not fatal: they are signed in, and a missing timestamp is worth a warning
    // rather than throwing them back out to the sign-in screen.
    if (error) console.warn('Could not record terms acceptance:', error.message);
}

export async function signInWithApple(): Promise<SocialAuthResult> {
    const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
    });

    if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
    });
    if (error) throw new Error(error.message);

    // Apple sends the name exactly once -- on the very first authorisation, and
    // never again. If it is not captured here it is gone for good, so a display
    // name is set from it while it exists. handle_new_user has already made a
    // fallback username by now, so this only improves on it.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();

    const user = data.user;
    const isNewUser = !!user && user.created_at === user.last_sign_in_at;

    if (user) {
        if (fullName) {
            await supabase
                .from('users')
                .update({ username: fullName.slice(0, 30) })
                .eq('id', user.id)
                // Only where the trigger's placeholder is still in place, so a
                // returning user who renamed themselves is not overwritten.
                .like('username', 'user\\_%');
        }
        await recordTermsAcceptance(user.id);
    }

    return { isNewUser };
}

export async function signInWithGoogle(): Promise<SocialAuthResult> {
    if (!isGoogleAuthAvailable()) throw new Error('Google sign-in is not configured');
    const { GoogleSignin } = ensureGoogleConfigured();

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    const response = await GoogleSignin.signIn();

    // Newer versions wrap the payload; older ones return it flat. Both shapes
    // are read so a library upgrade cannot silently break sign-in.
    const idToken = (response as any)?.data?.idToken ?? (response as any)?.idToken;
    if (!idToken) throw new Error('cancelled');

    const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
    });
    if (error) throw new Error(error.message);

    const user = data.user;
    const isNewUser = !!user && user.created_at === user.last_sign_in_at;
    if (user) await recordTermsAcceptance(user.id);

    return { isNewUser };
}

/** True when the person backed out rather than something going wrong. */
export function isCancellation(error: any): boolean {
    const message = String(error?.message ?? '');
    // Read through the lazy module: this is called from a catch block, and a
    // build without the native module must not throw on the way to deciding
    // whether someone simply backed out.
    const googleCancelled = loadGoogleModule()?.statusCodes?.SIGN_IN_CANCELLED;
    return (
        error?.code === 'ERR_REQUEST_CANCELED'
        || error?.code === 'ERR_CANCELED'
        || (googleCancelled !== undefined && error?.code === googleCancelled)
        || message === 'cancelled'
        || /cancell?ed/i.test(message)
    );
}
