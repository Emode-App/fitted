import { create } from 'zustand';
import { Platform } from 'react-native';
import { supabase } from '../services/supabase';
import { getSignedUrl } from '../services/privateMedia';
import { User } from '../types';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';

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
    signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
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

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    currentSessionId: null,

    initialize: async () => {
        try {
            // Restore persisted session ID across app restarts
            const storedSessionId = await SecureStore.getItemAsync(SESSION_KEY);
            if (storedSessionId) set({ currentSessionId: storedSessionId });

            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                const { data: profile } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

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
                    const { data: profile } = await supabase
                        .from('users')
                        .select('*')
                        .eq('id', session.user.id)
                        .single();

                    set({ session, user: await hydrateProfile(profile), isAuthenticated: true });

                    if (event === 'SIGNED_IN') {
                        const sessionId = await recordLoginSession(session.user.id);
                        if (sessionId) {
                            await SecureStore.setItemAsync(SESSION_KEY, sessionId);
                            set({ currentSessionId: sessionId });
                        }
                    }
                } else {
                    if (event === 'SIGNED_OUT') {
                        await SecureStore.deleteItemAsync(SESSION_KEY);
                        set({ currentSessionId: null });
                    }
                    set({ session: null, user: null, isAuthenticated: false });
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
                email,
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
                email,
                password,
            });

            if (authError) {
                return { error: authError.message };
            }

            if (authData.user) {
                const handle = `@${username.toLowerCase().replace(/\s+/g, '')}`;
                // email lives in auth.users (and the private_users mirror created
                // by a DB trigger) — it is no longer stored on the public users row.
                const { error: profileError } = await supabase
                    .from('users')
                    .insert({
                        id: authData.user.id,
                        username,
                        handle,
                        bio: '',
                        location: '',
                        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                    });

                if (profileError) {
                    return { error: profileError.message };
                }
            }

            return {};
        } catch (error: any) {
            return { error: error.message || 'Sign up failed' };
        }
    },

    signOut: async () => {
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
