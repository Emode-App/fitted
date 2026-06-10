// useTheme hook - Provides theme colors and mode throughout the app

import { useMemo } from 'react';
import { Appearance } from 'react-native';
import { useThemeStore, ThemeMode, ResolvedTheme } from '@/stores/themeStore';
import { Colors, ThemeColors } from '@/constants/colors';

interface UseThemeReturn {
    mode: ThemeMode;
    theme: ResolvedTheme;
    colors: ThemeColors;
    setMode: (mode: ThemeMode) => void;
    isDark: boolean;
}

export function useTheme(): UseThemeReturn {
    const mode = useThemeStore((state) => state.mode);
    const setMode = useThemeStore((state) => state.setMode);

    const theme = useMemo((): ResolvedTheme => {
        if (mode === 'system') {
            return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
        }
        return mode;
    }, [mode]);

    const colors = useMemo(() => Colors[theme], [theme]);
    const isDark = theme === 'dark';

    return {
        mode,
        theme,
        colors,
        setMode,
        isDark,
    };
}
