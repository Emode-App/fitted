import { StyleSheet, TextInput, Pressable, Image, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';

export default function CreateScreen() {
    const user = useAuthStore((state) => state.user);
    const [image, setImage] = useState<string | null>(null);
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera roll permissions');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: true,
        });

        if (!result.canceled && result.assets[0]) {
            setImage(result.assets[0].uri);
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
            base64: true,
        });

        if (!result.canceled && result.assets[0]) {
            setImage(result.assets[0].uri);
        }
    };

    const uploadImage = async (uri: string): Promise<string | null> => {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();

            const fileName = `${user?.id}/${Date.now()}.jpg`;

            // Convert blob to array buffer
            const arrayBuffer = await new Response(blob).arrayBuffer();

            const { data, error } = await supabase.storage
                .from('posts')
                .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });

            if (error) {
                console.error('Upload error:', error);
                return null;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('posts')
                .getPublicUrl(fileName);

            return urlData.publicUrl;
        } catch (error) {
            console.error('Upload error:', error);
            return null;
        }
    };

    const handlePublish = async () => {
        if (!image || !user) {
            Alert.alert('Error', 'Please select an image first');
            return;
        }

        setUploading(true);

        try {
            // Upload image to storage
            const imageUrl = await uploadImage(image);

            if (!imageUrl) {
                Alert.alert('Error', 'Failed to upload image');
                setUploading(false);
                return;
            }

            // Create post in database
            const { error } = await supabase.from('posts').insert({
                user_id: user.id,
                generated_image: imageUrl,
                caption: caption.trim(),
                items: [],
            });

            if (error) {
                Alert.alert('Error', error.message);
                setUploading(false);
                return;
            }

            // Success - reset and go to feed
            setImage(null);
            setCaption('');
            Alert.alert('Success', 'Your fit has been posted!');
            router.push('/(tabs)');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to create post');
        } finally {
            setUploading(false);
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <Text style={styles.title}>Create Fit</Text>
                <Pressable
                    style={[styles.publishButton, (!image || uploading) && styles.publishButtonDisabled]}
                    onPress={handlePublish}
                    disabled={!image || uploading}
                >
                    {uploading ? (
                        <ActivityIndicator color="#000" size="small" />
                    ) : (
                        <Text style={styles.publishButtonText}>Post</Text>
                    )}
                </Pressable>
            </View>

            {/* Image Preview / Picker */}
            <View style={styles.imageSection}>
                {image ? (
                    <View style={styles.previewContainer}>
                        <Image source={{ uri: image }} style={styles.preview} />
                        <Pressable style={styles.removeButton} onPress={() => setImage(null)}>
                            <Feather name="x" size={20} color="#fff" />
                        </Pressable>
                    </View>
                ) : (
                    <View style={styles.pickerContainer}>
                        <Feather name="image" size={48} color="#333" />
                        <Text style={styles.pickerText}>Add a photo</Text>
                        <View style={styles.pickerButtons}>
                            <Pressable style={styles.pickerButton} onPress={pickImage}>
                                <Feather name="image" size={20} color="#fff" />
                                <Text style={styles.pickerButtonText}>Gallery</Text>
                            </Pressable>
                            <Pressable style={styles.pickerButton} onPress={takePhoto}>
                                <Feather name="camera" size={20} color="#fff" />
                                <Text style={styles.pickerButtonText}>Camera</Text>
                            </Pressable>
                        </View>
                    </View>
                )}
            </View>

            {/* Caption Input */}
            <View style={styles.captionSection}>
                <TextInput
                    style={styles.captionInput}
                    placeholder="Write a caption..."
                    placeholderTextColor="#666"
                    value={caption}
                    onChangeText={setCaption}
                    multiline
                    maxLength={500}
                />
            </View>

            {/* Info */}
            <View style={styles.infoSection}>
                <Text style={styles.infoText}>
                    📸 This is a simplified post flow. The full Studio with AI try-on will be built next!
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    content: {
        paddingBottom: 100,
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
    title: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
    },
    publishButton: {
        backgroundColor: '#fff',
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    publishButtonDisabled: {
        opacity: 0.5,
    },
    publishButtonText: {
        color: '#000',
        fontWeight: '600',
        fontSize: 14,
    },
    imageSection: {
        padding: 16,
        backgroundColor: 'transparent',
    },
    previewContainer: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#111',
    },
    preview: {
        width: '100%',
        height: '100%',
    },
    removeButton: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerContainer: {
        width: '100%',
        aspectRatio: 1,
        backgroundColor: '#111',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#222',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerText: {
        color: '#666',
        fontSize: 16,
        marginTop: 12,
        marginBottom: 24,
    },
    pickerButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    pickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        gap: 8,
    },
    pickerButtonText: {
        color: '#fff',
        fontSize: 14,
    },
    captionSection: {
        padding: 16,
        backgroundColor: 'transparent',
    },
    captionInput: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    infoSection: {
        padding: 16,
        backgroundColor: 'transparent',
    },
    infoText: {
        color: '#666',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
});
