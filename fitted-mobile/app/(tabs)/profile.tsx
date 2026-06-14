import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Alert } from 'react-native';

import { useAuthStore } from '@/stores/authStore';
import { usePostsStore } from '@/stores/postsStore';
import { supabase } from '@/services/supabase';
import { PRIVATE_BUCKET, getSignedUrl } from '@/services/privateMedia';
import { Post } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import ProfileView, { Draft } from '@/components/ProfileView';
import SettingsDrawer from '@/components/SettingsDrawer';

type SettingsView = 'menu' | 'dressingRoom' | 'drafts' | 'appearance' | 'notifications' | 'privacy' | 'help';

export default function ProfileScreen() {
    const { colors } = useTheme();
    const params = useLocalSearchParams();
    const user = useAuthStore((state) => state.user);
    const session = useAuthStore((state) => state.session);
    const setUser = useAuthStore((state) => state.setUser);
    const fetchUserPosts = usePostsStore((state) => state.fetchUserPosts);
    const fetchSavedPosts = usePostsStore((state) => state.fetchSavedPosts);

    const [showSettings, setShowSettings] = useState(false);
    const [settingsInitialView, setSettingsInitialView] = useState<SettingsView>('menu');
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [userPosts, setUserPosts] = useState<Post[]>([]);
    const [savedPosts, setSavedPosts] = useState<Post[]>([]);
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [stats, setStats] = useState({ followers: 0, following: 0, fits: 0 });
    // Stays false until the first stats fetch resolves, so we show a placeholder
    // ("—") instead of flashing 0s on initial load. Never reset on subsequent
    // refreshes so background reloads don't flicker back to the placeholder.
    const [statsLoaded, setStatsLoaded] = useState(false);

    // Handle URL params to open settings directly
    useEffect(() => {
        const openSettings = params.openSettings as string;
        const settingsView = params.settingsView as SettingsView;

        if (openSettings === 'true') {
            setSettingsInitialView(settingsView || 'menu');
            setShowSettings(true);
            // Clear the params
            router.setParams({ openSettings: '', settingsView: '' });
        }
    }, [params.openSettings, params.settingsView]);

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

        // Fetch drafts
        const { data: draftsData, error } = await supabase
            .from('drafts')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (draftsData) {
            setDrafts(draftsData as Draft[]);
        }

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
        setStatsLoaded(true);
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
        if (!user?.id) return;

        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const uri = result.assets[0].uri;

                // Read file as base64
                const base64 = await FileSystem.readAsStringAsync(uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                // Upload to the PRIVATE bucket under the owner's folder. Only the
                // owner can read it (storage RLS); we persist the path, not a URL.
                const facePath = `faces/${user.id}/face.jpg`;
                const arrayBuffer = decode(base64);

                const { error: uploadError } = await supabase.storage
                    .from(PRIVATE_BUCKET)
                    .upload(facePath, arrayBuffer, {
                        contentType: 'image/jpeg',
                        upsert: true, // Overwrite if exists
                    });

                if (uploadError) {
                    console.error('Face upload error:', uploadError);
                    Alert.alert('Upload Failed', 'Could not upload face photo. Please try again.');
                    return;
                }

                // Store the object PATH; it is resolved to a fresh signed URL on read.
                const { error: updateError } = await supabase
                    .from('users')
                    .update({ ai_face_url: facePath })
                    .eq('id', user.id);

                if (updateError) {
                    console.error('User update error:', updateError);
                    Alert.alert('Update Failed', 'Could not save face photo. Please try again.');
                    return;
                }

                // Refresh local state with a signed URL the UI can render immediately.
                const signedFace = await getSignedUrl(facePath);
                setUser({ ...user, ai_face_url: signedFace || facePath });
                Alert.alert('Success', 'Face photo saved! It will be used for AI styling.');
            }
        } catch (error) {
            console.error('Error uploading face:', error);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        }
    };

    const handleDeleteDraft = async (id: string) => {
        try {
            const { error } = await supabase
                .from('drafts')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setDrafts(drafts.filter(d => d.id !== id));
            Alert.alert('Draft Deleted');
        } catch (error) {
            console.error('Error deleting draft:', error);
            Alert.alert('Error', 'Could not delete draft');
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
                statsLoaded={statsLoaded}
                onEditProfile={() => router.push('/edit-profile')}
                onAiFaceUpload={handleAiFaceUpload}
                onDeleteDraft={handleDeleteDraft}
                drafts={drafts}
                onRefresh={onRefresh}
                refreshing={refreshing}
            />
            <SettingsDrawer
                visible={showSettings}
                onClose={() => {
                    setShowSettings(false);
                    setSettingsInitialView('menu'); // Reset for next open
                }}
                initialView={settingsInitialView}
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
