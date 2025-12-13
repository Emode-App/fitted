import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { useAuthStore } from '@/stores/authStore';
import { usePostsStore } from '@/stores/postsStore';
import { supabase } from '@/services/supabase';
import { Post } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import ProfileView from '@/components/ProfileView';
import SettingsDrawer from '@/components/SettingsDrawer';

export default function ProfileScreen() {
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);
    const session = useAuthStore((state) => state.session);
    const setUser = useAuthStore((state) => state.setUser);
    const fetchUserPosts = usePostsStore((state) => state.fetchUserPosts);
    const fetchSavedPosts = usePostsStore((state) => state.fetchSavedPosts);

    const [showSettings, setShowSettings] = useState(false);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [userPosts, setUserPosts] = useState<Post[]>([]);
    const [savedPosts, setSavedPosts] = useState<Post[]>([]);
    const [stats, setStats] = useState({ followers: 0, following: 0, fits: 0 });

    // Fetch profile if user is null but session exists
    useEffect(() => {
        const fetchProfile = async () => {
            if (!user && session?.user) {
                setLoading(true);
                const { data } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (data) {
                    setUser(data);
                }
                setLoading(false);
            }
        };
        fetchProfile();
    }, [user, session]);

    // Fetch user's posts when tab comes into focus
    useFocusEffect(
        useCallback(() => {
            if (user?.id) {
                loadPosts();
            }
        }, [user?.id])
    );

    // Load posts and stats (not user data to avoid flickering)
    const loadPosts = async () => {
        if (!user?.id) return;

        const posts = await fetchUserPosts(user.id);
        setUserPosts(posts);

        const saved = await fetchSavedPosts(user.id);
        setSavedPosts(saved);

        // Get follower/following counts
        const [{ count: followers }, { count: following }] = await Promise.all([
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
        ]);

        setStats({
            followers: followers || 0,
            following: following || 0,
            fits: posts.length,
        });
    };

    // Full refresh including user data
    const loadProfileData = async () => {
        if (!user?.id) return;

        // Refetch user profile from database
        const { data: freshUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (freshUser) {
            setUser(freshUser);
        }

        await loadPosts();
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadProfileData();
        setRefreshing(false);
    };

    const handleAiFaceUpload = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                // TODO: Upload to Supabase and update user.ai_face_url
                alert('Face photo selected! Upload feature coming soon.');
            }
        } catch (error) {
            console.error('Error picking image:', error);
        }
    };

    if (loading || !user) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.text} size="large" />
                </View>
            </View>
        );
    }

    return (
        <>
            <ProfileView
                user={user}
                posts={userPosts}
                savedPosts={savedPosts}
                isOwnProfile={true}
                stats={stats}
                onEditProfile={() => router.push('/edit-profile')}
                onAiFaceUpload={handleAiFaceUpload}
                onRefresh={onRefresh}
                refreshing={refreshing}
            />
            <SettingsDrawer
                visible={showSettings}
                onClose={() => setShowSettings(false)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
