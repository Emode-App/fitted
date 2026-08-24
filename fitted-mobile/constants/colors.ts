// Theme Colors - Centralized color palette for light and dark modes
// Aligned with Emode Web (Zinc/Gray scale)

export const Colors = {
    light: {
        // Backgrounds
        background: '#ffffff',
        backgroundSecondary: '#f9fafb', // gray-50
        backgroundTertiary: '#f3f4f6',  // gray-100

        // Text
        text: '#09090b',       // zinc-950
        textSecondary: '#71717a', // zinc-500
        textTertiary: '#a1a1aa',  // zinc-400
        textInverse: '#ffffff',

        // Borders
        border: '#e4e4e7',      // zinc-200
        borderLight: '#f4f4f5', // zinc-100

        // Interactive
        primary: '#18181b',     // zinc-900 (Black)
        primaryForeground: '#ffffff',
        secondary: '#f4f4f5',   // zinc-100
        secondaryForeground: '#18181b',

        // Tab bar
        tabBar: '#ffffff',
        tabBarBorder: '#e4e4e7',
        tabActive: '#18181b',
        tabInactive: '#a1a1aa',

        // Inputs
        input: '#f4f4f5',       // zinc-100
        inputBorder: '#e4e4e7', // zinc-200
        placeholder: '#a1a1aa', // zinc-400

        // Status
        success: '#10b981', // emerald-500
        error: '#ef4444',   // red-500
        warning: '#f59e0b', // amber-500

        // Brand
        tint: '#18181b',
    },
    emode: {
        // Backgrounds
        background: '#F5F2EC',
        backgroundSecondary: '#f9fafb', // gray-50
        backgroundTertiary: '#f3f4f6',  // gray-100

        // Text
        text: '#09090b',       // zinc-950
        textSecondary: '#71717a', // zinc-500
        textTertiary: '#a1a1aa',  // zinc-400
        textInverse: '#ffffff',

        // Borders
        border: '#e4e4e7',      // zinc-200
        borderLight: '#f4f4f5', // zinc-100

        // Interactive
        primary: '#18181b',     // zinc-900 (Black)
        primaryForeground: '#ffffff',
        secondary: '#f4f4f5',   // zinc-100
        secondaryForeground: '#18181b',

        // Tab bar
        tabBar: '#F5F2EC',
        tabBarBorder: '#e4e4e7',
        tabActive: '#18181b',
        tabInactive: '#a1a1aa',

        // Inputs
        input: '#f4f4f5',       // zinc-100
        inputBorder: '#e4e4e7', // zinc-200
        placeholder: '#a1a1aa', // zinc-400

        // Status
        success: '#10b981', // emerald-500
        error: '#ef4444',   // red-500
        warning: '#f59e0b', // amber-500

        // Brand
        tint: '#18181b',
    },
    dark: {
        // Backgrounds
        background: '#000000',      // black
        backgroundSecondary: '#18181b', // zinc-900
        backgroundTertiary: '#27272a',  // zinc-800

        // Text
        text: '#ffffff',
        textSecondary: '#a1a1aa', // zinc-400
        textTertiary: '#71717a',  // zinc-500
        textInverse: '#000000',

        // Borders
        border: '#27272a',      // zinc-800
        borderLight: '#18181b', // zinc-900

        // Interactive
        primary: '#ffffff',     // White
        primaryForeground: '#000000',
        secondary: '#27272a',   // zinc-800
        secondaryForeground: '#ffffff',

        // Tab bar
        tabBar: '#000000',
        tabBarBorder: '#27272a',
        tabActive: '#ffffff',
        tabInactive: '#52525b', // zinc-600

        // Inputs
        input: '#27272a',       // zinc-800
        inputBorder: '#3f3f46', // zinc-700
        placeholder: '#71717a', // zinc-500

        // Status
        success: '#34d399', // emerald-400
        error: '#f87171',   // red-400
        warning: '#fbbf24', // amber-400

        // Brand
        tint: '#ffffff',
    },
};

export type ThemeColors = typeof Colors.light;

export const useThemeColor = (
    props: { light?: string; dark?: string },
    colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) => {
    //   const theme = useColorScheme() ?? 'light';
    // defaulting to light for now to avoid complexity until useColorScheme is robust
    const theme = 'light';
    const colorFromProps = props[theme];

    if (colorFromProps) {
        return colorFromProps;
    } else {
        return Colors[theme][colorName];
    }
};

export const getColors = (theme: 'light' | 'dark' | 'emode'): ThemeColors => {
    return Colors[theme];
};
