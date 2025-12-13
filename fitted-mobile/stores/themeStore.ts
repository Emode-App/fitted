// Theme Store - Zustand with AsyncStorage persistence
// Manages light/dark/system theme preference

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    getResolvedTheme: () => ResolvedTheme;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            mode: 'light', // Default to light

            setMode: (mode) => {
                set({ mode });
            },

            getResolvedTheme: () => {
                const { mode } = get();
                if (mode === 'system') {
                    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
                }
                return mode;
            },
        }),
        {
            name: 'theme-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

// Hook to get current resolved theme (light or dark)
export const useResolvedTheme = (): ResolvedTheme => {
    const mode = useThemeStore((state) => state.mode);

    if (mode === 'system') {
        const systemTheme = Appearance.getColorScheme();
        return systemTheme === 'dark' ? 'dark' : 'light';
    }
    return mode;
};
