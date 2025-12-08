import { StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';

export default function EditProfileScreen() {
    const user = useAuthStore((state) => state.user);
    const setUser = useAuthStore((state) => state.setUser);

    const [username, setUsername] = useState(user?.username || '');
    const [handle, setHandle] = useState(user?.handle?.replace('@', '') || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
    const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setUsername(user.username || '');
            setHandle(user.handle?.replace('@', '') || '');
            setBio(user.bio || '');
            setAvatarUrl(user.avatar_url || '');
        }
    }, [user]);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera roll permissions');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            setNewAvatarUri(result.assets[0].uri);
        }
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera permissions');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            setNewAvatarUri(result.assets[0].uri);
        }
    };

    const showImageOptions = () => {
        Alert.alert(
            'Change Profile Photo',
            'Choose an option',
            [
                { text: 'Take Photo', onPress: takePhoto },
                { text: 'Choose from Library', onPress: pickImage },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    const uploadAvatar = async (uri: string): Promise<string | null> => {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const arrayBuffer = await new Response(blob).arrayBuffer();

            const fileName = `avatars/${user?.id}/${Date.now()}.jpg`;

            const { error } = await supabase.storage
                .from('posts')
                .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true,
                });

            if (error) {
                console.error('Upload error:', error);
                return null;
            }

            const { data: urlData } = supabase.storage
                .from('posts')
                .getPublicUrl(fileName);

            return urlData.publicUrl;
        } catch (error) {
            console.error('Upload error:', error);
            return null;
        }
    };

    const handleSave = async () => {
        if (!user) return;

        if (!username.trim()) {
            Alert.alert('Error', 'Username cannot be empty');
            return;
        }

        if (!handle.trim()) {
            Alert.alert('Error', 'Handle cannot be empty');
            return;
        }

        // Validate handle format (alphanumeric and underscores only)
        if (!/^[a-zA-Z0-9_]+$/.test(handle)) {
            Alert.alert('Error', 'Handle can only contain letters, numbers, and underscores');
            return;
        }

        setSaving(true);

        try {
            let finalAvatarUrl = avatarUrl;

            // Upload new avatar if selected
            if (newAvatarUri) {
                const uploadedUrl = await uploadAvatar(newAvatarUri);
                if (uploadedUrl) {
                    finalAvatarUrl = uploadedUrl;
                } else {
                    Alert.alert('Error', 'Failed to upload avatar');
                    setSaving(false);
                    return;
                }
            }

            // Update user in database
            const { error } = await supabase
                .from('users')
                .update({
                    username: username.trim(),
                    handle: `@${handle.trim().toLowerCase()}`,
                    bio: bio.trim(),
                    avatar_url: finalAvatarUrl,
                })
                .eq('id', user.id);

            if (error) {
                Alert.alert('Error', error.message);
                setSaving(false);
                return;
            }

            // Update local state
            setUser({
                ...user,
                username: username.trim(),
                handle: `@${handle.trim().toLowerCase()}`,
                bio: bio.trim(),
                avatar_url: finalAvatarUrl,
            });

            Alert.alert('Success', 'Profile updated!');
            router.back();
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const displayAvatarUri = newAvatarUri || avatarUrl;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.cancelButton}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Text style={styles.title}>Edit Profile</Text>
                <Pressable
                    onPress={handleSave}
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#000" size="small" />
                    ) : (
                        <Text style={styles.saveText}>Save</Text>
                    )}
                </Pressable>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {/* Avatar Section */}
                <Pressable style={styles.avatarSection} onPress={showImageOptions}>
                    <View style={styles.avatarWrapper}>
                        {displayAvatarUri ? (
                            <Image source={{ uri: displayAvatarUri }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Feather name="user" size={40} color="#666" />
                            </View>
                        )}
                        <View style={styles.editBadge}>
                            <Feather name="camera" size={14} color="#fff" />
                        </View>
                    </View>
                    <Text style={styles.changePhotoText}>Change Profile Photo</Text>
                </Pressable>

                {/* Form Fields */}
                <View style={styles.formSection}>
                    <View style={styles.field}>
                        <Text style={styles.label}>Name</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Your display name"
                            placeholderTextColor="#666"
                            maxLength={30}
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Username</Text>
                        <View style={styles.handleInputWrapper}>
                            <Text style={styles.atSymbol}>@</Text>
                            <TextInput
                                style={styles.handleInput}
                                value={handle}
                                onChangeText={(text) => setHandle(text.replace(/[^a-zA-Z0-9_]/g, ''))}
                                placeholder="username"
                                placeholderTextColor="#666"
                                autoCapitalize="none"
                                autoCorrect={false}
                                maxLength={20}
                            />
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Bio</Text>
                        <TextInput
                            style={[styles.input, styles.bioInput]}
                            value={bio}
                            onChangeText={setBio}
                            placeholder="Tell us about yourself"
                            placeholderTextColor="#666"
                            multiline
                            maxLength={150}
                        />
                        <Text style={styles.charCount}>{bio.length}/150</Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#000',
        borderBottomWidth: 0.5,
        borderBottomColor: '#222',
    },
    cancelButton: {
        minWidth: 60,
    },
    cancelText: {
        color: '#fff',
        fontSize: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    saveButton: {
        backgroundColor: '#fff',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
        minWidth: 60,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.5,
    },
    saveText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '600',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingBottom: 40,
    },
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 32,
        backgroundColor: 'transparent',
    },
    avatarWrapper: {
        position: 'relative',
        backgroundColor: 'transparent',
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#000',
    },
    changePhotoText: {
        color: '#0095f6',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 12,
    },
    formSection: {
        paddingHorizontal: 16,
        backgroundColor: 'transparent',
    },
    field: {
        marginBottom: 24,
        backgroundColor: 'transparent',
    },
    label: {
        fontSize: 14,
        color: '#888',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
    },
    bioInput: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    charCount: {
        fontSize: 12,
        color: '#666',
        textAlign: 'right',
        marginTop: 4,
    },
    handleInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        paddingHorizontal: 16,
    },
    atSymbol: {
        color: '#888',
        fontSize: 16,
        marginRight: 2,
    },
    handleInput: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        paddingVertical: 16,
    },
});
