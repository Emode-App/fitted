import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { User } from '../types';

interface AuthState {
    user: User | null;
    session: any | null;
    isLoading: boolean;
    isAuthenticated: boolean;

    // Actions
    initialize: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<{ error?: string }>;
    signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
    setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,

    initialize: async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                // Fetch user profile from our users table
                const { data: profile } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                set({
                    session,
                    user: profile,
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

                    set({
                        session,
                        user: profile,
                        isAuthenticated: true
                    });
                } else {
                    set({
                        session: null,
                        user: null,
                        isAuthenticated: false
                    });
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
                // Create user profile
                const handle = `@${username.toLowerCase().replace(/\s+/g, '')}`;
                const { error: profileError } = await supabase
                    .from('users')
                    .insert({
                        id: authData.user.id,
                        email,
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
}));
