import { create } from 'zustand';
import { Platform } from 'react-native';
import { supabase } from '../services/supabase';
import { getSignedUrl } from '../services/privateMedia';
import { unregisterPush } from '../services/pushNotifications';
import { User } from '../types';
import * as Device from 'expo-device';
import { logOutPurchases } from '../services/revenueCatService';
import { deleteSecureItem, getSecureItem, setSecureItem } from '../services/secureStorage';
import { claimLocalCache, clearLocalUserData } from '../services/localUserData';
import { restoreWardrobeFromStorage } from '../services/wardrobeRestore';
import { syncWardrobe, startWardrobeSync, stopWardrobeSync } from '../services/wardrobeSync';
import { useSavedItemsStore } from './savedItemsStore';

const SESSION_KEY = 'current_login_session_id';

// Profiles store the face photo as a private-bucket object path; resolve it to a
// short-lived signed URL the UI can render.
async function hydrateProfile(profile: User | null): Promise<User | null> {
    if (profile?.ai_face_url) {
        profile.ai_face_url = (await getSignedUrl(profile.ai_face_url)) || undefined;
    }
    return profile;
}

interface AuthState {
    user: User | null;
    session: any | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    currentSessionId: string | null;

    // Actions
    initialize: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<{ error?: string }>;
    signUp: (email: string, password: string, username: string) => Promise<{ error?: string; needsEmailConfirmation?: boolean }>;
    requestPasswordReset: (email: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
    deleteAccount: () => Promise<void>;
    setUser: (user: User | null) => void;
    updateProfile: (updates: Partial<User>) => Promise<void>;
}

async function recordLoginSession(userId: string): Promise<string | null> {
    try {
        const deviceName = Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android Device');
        const deviceType = Device.deviceType === Device.DeviceType.TABLET ? 'tablet' : 'phone';
        const { data } = await supabase
            .from('login_sessions')
            .insert({ user_id: userId, device_name: deviceName, device_type: deviceType, platform: Platform.OS })
            .select('id')
            .single();
        return data?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * Bring the wardrobe up to date for `userId`.
 *
 * Order matters. The storage rebuild only fires for accounts whose wardrobe is
 * empty, so it has to run before the sync -- otherwise a device that had lost its
 * local cache would push that emptiness at the server. syncWardrobe is additive
 * and idempotent, so running it afterwards is safe either way.
 */
/**
 * Read the profile row, allowing for it not being there quite yet.
 *
 * It is created by a trigger inside the signup transaction, but the very first
 * read after confirming an email can still land before it is visible. A null
 * profile leaves the app authenticated with no user, and the onboarding gate
 * deliberately does nothing in that state -- which strands somebody on the sign
 * in screen with no way forward but relaunching.
 */
async function fetchProfileWithRetry(userId: string, attempts = 3): Promise<any> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const { data } = await supabase.from('users').select('*').eq('id', userId).single();
        if (data) return data;
        if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return null;
}

async function hydrateWardrobe(userId: string): Promise<void> {
    startWardrobeSync(userId);
    await restoreWardrobeFromStorage(userId);
    await syncWardrobe(userId);
    // Which pieces this account has hearted, so the hearts are already right on
    // the first screen rather than filling in a beat later.
    useSavedItemsStore.getState().hydrate(userId).catch(() => {});
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    currentSessionId: null,

    initialize: async () => {
        try {
            // Restore persisted session ID across app restarts
            const storedSessionId = await getSecureItem(SESSION_KEY);
            if (storedSessionId) set({ currentSessionId: storedSessionId });

            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                // Backstop for a sign-out that never ran: force-quit mid-logout,
                // a server-side session expiry, or a token revoked from another
                // device. Purges the cache before any of it can be rendered.
                await claimLocalCache(session.user.id);
                void hydrateWardrobe(session.user.id);

                const profile = await fetchProfileWithRetry(session.user.id);

                set({
                    session,
                    user: await hydrateProfile(profile),
                    isAuthenticated: true,
                    isLoading: false
                });
            } else {
                set({ isLoading: false });
            }

            // Listen for auth changes
            supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    // Catches the in-process account switch, where sign-out ran but
                    // this listener is what actually sees the new identity arrive.
                    await claimLocalCache(session.user.id);
                    void hydrateWardrobe(session.user.id);

                    const profile = await fetchProfileWithRetry(session.user.id);

                    // isLoading is cleared here too. It was only ever cleared by
                    // initialize(), so a session that arrived through this
                    // listener -- an email confirmation link, an account switch --
                    // could leave the flag set, and the onboarding gate bails out
                    // while it is.
                    set({
                        session,
                        user: await hydrateProfile(profile),
                        isAuthenticated: true,
                        isLoading: false,
                    });

                    if (event === 'SIGNED_IN') {
                        const sessionId = await recordLoginSession(session.user.id);
                        if (sessionId) {
                            await setSecureItem(SESSION_KEY, sessionId);
                            set({ currentSessionId: sessionId });
                        }
                    }
                } else {
                    if (event === 'SIGNED_OUT') {
                        await deleteSecureItem(SESSION_KEY);
                        set({ currentSessionId: null });
                    }
                    set({ session: null, user: null, isAuthenticated: false, isLoading: false });
                }
            });
        } catch (error) {
            console.error('Auth initialization error:', error);
            set({ isLoading: false });
        }
    },

    signIn: async (email: string, password: string) => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
            });

            if (error) {
                return { error: error.message };
            }

            return {};
        } catch (error: any) {
            return { error: error.message || 'Sign in failed' };
        }
    },

    signUp: async (email: string, password: string, username: string) => {
        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email.trim().toLowerCase(),
                password,
                options: {
                    emailRedirectTo: 'emode://auth',
                    data: {
                        username: username.trim(),
                        terms_accepted: true,
                        terms_version: '2026-08-12',
                    },
                },
            });

            if (authError) {
                return { error: authError.message };
            }

            return { needsEmailConfirmation: !authData.session };
        } catch (error: any) {
            return { error: error.message || 'Sign up failed' };
        }
    },

    requestPasswordReset: async (email: string) => {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
                redirectTo: 'emode://reset-password',
            });
            return error ? { error: error.message } : {};
        } catch (error: any) {
            return { error: error.message || 'Could not send reset email' };
        }
    },

    signOut: async () => {
        // Remove this device's push token while the session is still valid (RLS).
        await unregisterPush();
        await logOutPurchases();
        // Wardrobe assets, recent searches and tutorial state are cached on the
        // device. Without this the next account to sign in on this phone inherits
        // them, including the previous user's uploaded clothing photos.
        stopWardrobeSync();
        useSavedItemsStore.getState().reset();
        await clearLocalUserData();
        await supabase.auth.signOut();
        set({ user: null, session: null, isAuthenticated: false });
    },

    // Permanently delete the account (Apple Guideline 5.1.1(v)). The edge
    // function removes all app data + the auth user using the service role; we
    // then clear the local session. Throws on failure so the UI can surface it.
    deleteAccount: async () => {
        const { error } = await supabase.functions.invoke('delete-account', { body: {} });
        if (error) {
            let reason = error.message || 'Account deletion failed';
            try {
                const body = await error.context?.json?.();
                if (body?.error) reason = body.error;
            } catch {
                // ignore parse failures
            }
            throw new Error(reason);
        }
        await logOutPurchases();
        stopWardrobeSync();
        useSavedItemsStore.getState().reset();
        await clearLocalUserData();
        await supabase.auth.signOut();
        set({ user: null, session: null, isAuthenticated: false });
    },

    setUser: (user: User | null) => set({ user }),

    updateProfile: async (updates: Partial<User>) => {
        const { user } = get();
        if (!user) return;

        set({ user: { ...user, ...updates } });

        try {
            const { error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', user.id);

            if (error) {
                console.error('Error updating profile:', error);
            }
        } catch (error) {
            console.error('Exception updating profile:', error);
        }
    },
}));
