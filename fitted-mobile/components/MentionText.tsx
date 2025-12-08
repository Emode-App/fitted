import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/services/supabase';

interface MentionTextProps {
    text: string;
    style?: any;
    mentionStyle?: any;
}

export default function MentionText({ text, style, mentionStyle }: MentionTextProps) {
    // Parse text to find @mentions
    const parts = text.split(/(@\w+)/g);

    const handleMentionPress = async (mention: string) => {
        const handle = mention.toLowerCase(); // e.g., "@username"

        // Look up user by handle
        const { data: user, error } = await supabase
            .from('users')
            .select('id')
            .eq('handle', handle)
            .single();

        if (user && !error) {
            router.push({ pathname: '/user/[id]', params: { id: user.id } });
        }
    };

    return (
        <Text style={style}>
            {parts.map((part, index) => {
                if (part.startsWith('@')) {
                    return (
                        <Text
                            key={index}
                            style={[styles.mention, mentionStyle]}
                            onPress={() => handleMentionPress(part)}
                        >
                            {part}
                        </Text>
                    );
                }
                return part;
            })}
        </Text>
    );
}

const styles = StyleSheet.create({
    mention: {
        color: '#0095f6',
        fontWeight: '500',
    },
});
