import { View as DefaultView, Text as DefaultText, useColorScheme } from 'react-native';

type ThemeProps = {
    lightColor?: string;
    darkColor?: string;
};

export type ViewProps = ThemeProps & DefaultView['props'];
export type TextProps = ThemeProps & DefaultText['props'];

export function useThemeColor(
    props: { light?: string; dark?: string },
    colorName: 'text' | 'background'
) {
    const theme = useColorScheme() ?? 'light';
    const colorFromProps = props[theme];

    if (colorFromProps) {
        return colorFromProps;
    }
}

export function View(props: ViewProps) {
    const { style, lightColor, darkColor, ...otherProps } = props;
    const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

    return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}

export function Text(props: TextProps) {
    const { style, lightColor, darkColor, ...otherProps } = props;
    const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

    return <DefaultText style={[{ color }, style]} {...otherProps} />;
}
