import { StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView, Alert, KeyboardAvoidingView, Platform, PanResponder, Dimensions, Image as RNImage } from 'react-native';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/hooks/useTheme';
import { PLATFORM_CONFIG } from '@/constants/payments';

const HEADER_HEIGHT = 140;

export default function EditProfileScreen() {
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);
    const setUser = useAuthStore((state) => state.setUser);

    // Core Identity
    const [username, setUsername] = useState(user?.username || '');
    const [handle, setHandle] = useState(user?.handle?.replace('@', '') || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [location, setLocation] = useState(user?.location || '');
    const [website, setWebsite] = useState(user?.website || '');

    // Visual Assets
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
    const [headerUrl, setHeaderUrl] = useState(user?.header_url || '');
    const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
    const [newHeaderUri, setNewHeaderUri] = useState<string | null>(null);

    // Header image dimensions (for new images only)
    const [headerImageHeight, setHeaderImageHeight] = useState(HEADER_HEIGHT);

    // Favorites
    const [favoriteBrand, setFavoriteBrand] = useState(user?.favorite_brand || '');
    const [sessionPrice, setSessionPrice] = useState(
        user?.styling_rate_cents != null ? (user.styling_rate_cents / 100).toFixed(2) : ''
    );
    const [songTitle, setSongTitle] = useState(user?.favorite_song?.title || '');
    const [songArtist, setSongArtist] = useState(user?.favorite_song?.artist || '');
    const [songUrl, setSongUrl] = useState(user?.favorite_song?.url || '');

    // Social Links
    const [instagram, setInstagram] = useState(user?.socials?.instagram || '');
    const [tiktok, setTiktok] = useState(user?.socials?.tiktok || '');
    const [twitter, setTwitter] = useState(user?.socials?.twitter || '');

    const [saving, setSaving] = useState(false);

    // Header repositioning state (only for NEW images)
    const [headerPositionY, setHeaderPositionY] = useState(0);
    const [isRepositioning, setIsRepositioning] = useState(false);
    const panStartY = useRef(0);
    const currentPositionY = useRef(0);

    // Display URIs
    const displayAvatarUri = newAvatarUri || avatarUrl;
    const displayHeaderUri = newHeaderUri || headerUrl;

    // Track if we're editing an existing header
    const [isEditingExistingHeader, setIsEditingExistingHeader] = useState(false);

    // Can reposition if: new image picked OR editing existing header
    const canReposition = !!newHeaderUri || isEditingExistingHeader;

    useEffect(() => {
        if (user) {
            setUsername(user.username || '');
            setHandle(user.handle?.replace('@', '') || '');
            setBio(user.bio || '');
            setLocation(user.location || '');
            setWebsite(user.website || '');
            setAvatarUrl(user.avatar_url || '');
            setHeaderUrl(user.header_url || '');
            setFavoriteBrand(user.favorite_brand || '');
            setSongTitle(user.favorite_song?.title || '');
            setSongArtist(user.favorite_song?.artist || '');
            setSongUrl(user.favorite_song?.url || '');
            setInstagram(user.socials?.instagram || '');
            setTiktok(user.socials?.tiktok || '');
            setTwitter(user.socials?.twitter || '');
        }
    }, [user]);

    // Calculate max pan based on image height
    const maxPan = Math.max(0, (headerImageHeight - HEADER_HEIGHT) / 2);

    // PanResponder for dragging header image
    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => canReposition,
        onMoveShouldSetPanResponder: () => canReposition,
        onPanResponderGrant: () => {
            panStartY.current = currentPositionY.current;
            setIsRepositioning(true);
        },
        onPanResponderMove: (_, gestureState) => {
            // Pan through the full image height
            const newY = panStartY.current + gestureState.dy;
            const clampedY = Math.max(-maxPan, Math.min(maxPan, newY));
            currentPositionY.current = clampedY;
            setHeaderPositionY(clampedY);
        },
        onPanResponderRelease: () => {
            // Position captured, wait for confirm/cancel
        },
    }), [canReposition, maxPan]);

    // Confirm header position
    const confirmHeaderPosition = () => {
        setIsRepositioning(false);
    };

    // Cancel header repositioning
    const cancelHeaderReposition = () => {
        currentPositionY.current = 0;
        setHeaderPositionY(0);
        setIsRepositioning(false);
        setIsEditingExistingHeader(false);
    };

    // Enable editing of existing header
    const enableEditExistingHeader = () => {
        if (headerUrl && !newHeaderUri) {
            // Treat existing header as editable
            // Load its dimensions for proper panning
            RNImage.getSize(headerUrl, (width, height) => {
                const screenW = Dimensions.get('window').width;
                const scaledHeight = (height / width) * screenW;
                setHeaderImageHeight(scaledHeight);
                setIsEditingExistingHeader(true);
                setIsRepositioning(true);
            }, (error) => {
                console.error('Failed to get header dimensions:', error);
                // Fallback: still allow editing with default height
                setHeaderImageHeight(280);
                setIsEditingExistingHeader(true);
                setIsRepositioning(true);
            });
        }
    };

    // Process header image (Crop based on position)
    const processHeaderImage = async (uri: string, positionY: number, imageHeight: number): Promise<string | null> => {
        try {
            // Get original dimensions
            const { width: origW, height: origH } = await new Promise<{ width: number, height: number }>((resolve, reject) => {
                RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
            });

            const screenW = Dimensions.get('window').width;

            // The image is scaled to fit screen width
            const scale = screenW / origW;
            const scaledH = origH * scale;

            // Center offset in the visible frame
            const centerY = (scaledH - HEADER_HEIGHT) / 2;

            // positionY shifts the image: negative = see lower parts, positive = see higher parts
            // So cropY = centerY - positionY (in scaled coords)
            const cropYScaled = centerY - positionY;

            // Convert to original image coordinates
            const cropY = cropYScaled / scale;
            const cropH = HEADER_HEIGHT / scale;

            // Ensure bounds are valid
            const finalY = Math.max(0, Math.min(origH - cropH, cropY));
            const finalH = Math.min(origH - finalY, cropH);

            const result = await manipulateAsync(
                uri,
                [{ crop: { originX: 0, originY: finalY, width: origW, height: finalH } }],
                { compress: 0.8, format: SaveFormat.JPEG }
            );

            return result.uri;
        } catch (error) {
            console.error('Crop failed:', error);
            return null;
        }
    };

    const pickImage = async (type: 'avatar' | 'header') => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: type === 'avatar',
            aspect: type === 'avatar' ? [1, 1] : undefined,
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            if (type === 'avatar') {
                setNewAvatarUri(result.assets[0].uri);
            } else {
                const uri = result.assets[0].uri;
                setNewHeaderUri(uri);
                setHeaderPositionY(0);
                currentPositionY.current = 0;

                // Calculate the actual scaled height of this image
                RNImage.getSize(uri, (width, height) => {
                    const screenW = Dimensions.get('window').width;
                    const scaledHeight = (height / width) * screenW;
                    setHeaderImageHeight(scaledHeight);
                });
            }
        }
    };

    const takePhoto = async (type: 'avatar' | 'header') => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera permissions');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: type === 'avatar',
            aspect: type === 'avatar' ? [1, 1] : undefined,
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            if (type === 'avatar') {
                setNewAvatarUri(result.assets[0].uri);
            } else {
                const uri = result.assets[0].uri;
                setNewHeaderUri(uri);
                setHeaderPositionY(0);
                currentPositionY.current = 0;

                // Calculate the actual scaled height of this image
                RNImage.getSize(uri, (width, height) => {
                    const screenW = Dimensions.get('window').width;
                    const scaledHeight = (height / width) * screenW;
                    setHeaderImageHeight(scaledHeight);
                });
            }
        }
    };

    const showImageOptions = (type: 'avatar' | 'header') => {
        Alert.alert(
            type === 'avatar' ? 'Change Profile Photo' : 'Change Header Image',
            'Choose an option',
            [
                { text: 'Take Photo', onPress: () => takePhoto(type) },
                { text: 'Choose from Library', onPress: () => pickImage(type) },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    const uploadImage = async (uri: string, folder: string): Promise<string | null> => {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const arrayBuffer = await new Response(blob).arrayBuffer();

            if (!user?.id) return null;
            const fileName = `${user.id}/${folder}_${Date.now()}.jpg`;

            const { error } = await supabase.storage
                .from('avatars')
                .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true,
                });

            if (error) {
                console.error('Upload error:', error);
                return null;
            }

            const { data: urlData } = supabase.storage
                .from('avatars')
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
            Alert.alert('Error', 'Display name cannot be empty');
            return;
        }

        if (!handle.trim()) {
            Alert.alert('Error', 'Username cannot be empty');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(handle)) {
            Alert.alert('Error', 'Username can only contain letters, numbers, and underscores');
            return;
        }

        setSaving(true);

        try {
            let finalAvatarUrl = avatarUrl;
            let finalHeaderUrl = headerUrl;

            if (newAvatarUri) {
                const uploadedUrl = await uploadImage(newAvatarUri, 'avatars');
                if (uploadedUrl) {
                    finalAvatarUrl = uploadedUrl;
                } else {
                    Alert.alert('Error', 'Failed to upload avatar');
                    setSaving(false);
                    return;
                }
            }

            if (newHeaderUri) {
                // Crop based on user's position selection
                const croppedUri = await processHeaderImage(newHeaderUri, headerPositionY, headerImageHeight);
                if (!croppedUri) {
                    Alert.alert('Error', 'Failed to process header image');
                    setSaving(false);
                    return;
                }

                const uploadedUrl = await uploadImage(croppedUri, 'headers');
                if (uploadedUrl) {
                    finalHeaderUrl = uploadedUrl;
                } else {
                    Alert.alert('Error', 'Failed to upload header');
                    setSaving(false);
                    return;
                }
            } else if (isEditingExistingHeader && headerPositionY !== 0) {
                // Editing existing header - crop and re-upload
                const croppedUri = await processHeaderImage(headerUrl, headerPositionY, headerImageHeight);
                if (!croppedUri) {
                    Alert.alert('Error', 'Failed to process header image');
                    setSaving(false);
                    return;
                }

                const uploadedUrl = await uploadImage(croppedUri, 'headers');
                if (uploadedUrl) {
                    finalHeaderUrl = uploadedUrl;
                } else {
                    Alert.alert('Error', 'Failed to upload header');
                    setSaving(false);
                    return;
                }
            }

            const favoriteSong = songTitle.trim() ? {
                title: songTitle.trim(),
                artist: songArtist.trim(),
                url: songUrl.trim() || undefined,
            } : null;

            const socials = {
                instagram: instagram.trim() || undefined,
                tiktok: tiktok.trim() || undefined,
                twitter: twitter.trim() || undefined,
            };

            // Session price is stored in cents. Empty means "not taking bookings",
            // which is distinct from zero and must survive as NULL.
            let ratePayload: Record<string, number | null> = {};
            if (user.is_verified_stylist) {
                const trimmed = sessionPrice.trim();
                if (!trimmed) {
                    ratePayload = { styling_rate_cents: null };
                } else {
                    const dollars = Number(trimmed.replace(/[^0-9.]/g, ''));
                    if (!Number.isFinite(dollars) || dollars < 5 || dollars > 500) {
                        Alert.alert('Invalid Session Price', 'Enter an amount between $5 and $500, or leave it empty to stop taking bookings.');
                        setSaving(false);
                        return;
                    }
                    ratePayload = { styling_rate_cents: Math.round(dollars * 100) };
                }
            }

            const { error } = await supabase
                .from('users')
                .update({
                    username: username.trim(),
                    handle: `@${handle.trim().toLowerCase()}`,
                    bio: bio.trim(),
                    location: location.trim(),
                    website: website.trim(),
                    avatar_url: finalAvatarUrl,
                    header_url: finalHeaderUrl,
                    favorite_brand: favoriteBrand.trim() || null,
                    favorite_song: favoriteSong,
                    socials: socials,
                    ...ratePayload,
                })
                .eq('id', user.id);

            if (error) {
                Alert.alert('Error', error.message);
                setSaving(false);
                return;
            }

            setUser({
                ...user,
                username: username.trim(),
                handle: `@${handle.trim().toLowerCase()}`,
                bio: bio.trim(),
                location: location.trim(),
                website: website.trim(),
                avatar_url: finalAvatarUrl,
                header_url: finalHeaderUrl,
                favorite_brand: favoriteBrand.trim() || undefined,
                favorite_song: favoriteSong || undefined,
                socials: socials,
            });

            Alert.alert('Success', 'Profile updated!');
            router.back();
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    // Calculate image style based on whether it's new or existing
    const getHeaderImageStyle = () => {
        if (newHeaderUri || isEditingExistingHeader) {
            // New image or editing existing: show at full height, allow panning
            const centerOffset = (headerImageHeight - HEADER_HEIGHT) / 2;
            return {
                width: '100%' as const,
                height: headerImageHeight,
                transform: [{ translateY: -centerOffset + headerPositionY }]
            };
        } else {
            // Existing header: already cropped, show at container size
            return {
                width: '100%' as const,
                height: HEADER_HEIGHT,
            };
        }
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                <Pressable onPress={() => router.back()} style={styles.cancelButton}>
                    <Feather name="arrow-left" size={24} color={colors.text} />
                </Pressable>
                <Text style={[styles.title, { color: colors.text }]}>Edit Profile</Text>
                <Pressable
                    onPress={handleSave}
                    style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.saveButtonDisabled]}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color={colors.textInverse} size="small" />
                    ) : (
                        <Text style={[styles.saveText, { color: colors.textInverse }]}>Save</Text>
                    )}
                </Pressable>
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
                scrollEnabled={!isRepositioning}
            >
                {/* Header Image Section */}
                <View style={styles.headerSection}>
                    {displayHeaderUri ? (
                        <View style={styles.headerImageContainer} {...(canReposition ? panResponder.panHandlers : {})}>
                            <Image
                                source={{ uri: displayHeaderUri }}
                                style={getHeaderImageStyle()}
                                contentFit="cover"
                            />

                            {/* Drag hint - only for new images */}
                            {canReposition && !isRepositioning && (
                                <View style={styles.dragHintOverlay}>
                                    <Feather name="move" size={16} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.dragHintText}>Drag to adjust position</Text>
                                </View>
                            )}

                            {/* Change button */}
                            {!isRepositioning && (
                                <Pressable
                                    style={[styles.headerChangeButton, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
                                    onPress={() => showImageOptions('header')}
                                >
                                    <Feather name="camera" size={14} color="#fff" />
                                    <Text style={styles.headerChangeText}>Change</Text>
                                </Pressable>
                            )}

                            {/* Confirm/Cancel when repositioning */}
                            {isRepositioning && (
                                <View style={styles.repositionControls}>
                                    <Pressable style={styles.repositionCancelButton} onPress={cancelHeaderReposition}>
                                        <Feather name="x" size={16} color="#fff" />
                                    </Pressable>
                                    <Pressable style={styles.repositionConfirmButton} onPress={confirmHeaderPosition}>
                                        <Feather name="check" size={16} color="#fff" />
                                    </Pressable>
                                </View>
                            )}
                        </View>
                    ) : (
                        <Pressable
                            style={[styles.headerPlaceholder, { backgroundColor: colors.backgroundTertiary }]}
                            onPress={() => showImageOptions('header')}
                        >
                            <Feather name="image" size={32} color={colors.textTertiary} />
                            <Text style={[styles.headerPlaceholderText, { color: colors.textTertiary }]}>Add Header Image</Text>
                        </Pressable>
                    )}
                </View>

                {/* Avatar Section */}
                <Pressable style={styles.avatarSection} onPress={() => showImageOptions('avatar')}>
                    <View style={[styles.avatarWrapper, { borderColor: colors.background }]}>
                        {displayAvatarUri ? (
                            <Image source={{ uri: displayAvatarUri }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                                <Feather name="user" size={40} color={colors.textTertiary} />
                            </View>
                        )}
                        <View style={[styles.editBadge, { backgroundColor: colors.backgroundSecondary, borderColor: colors.background }]}>
                            <Feather name="camera" size={14} color={colors.text} />
                        </View>
                    </View>
                </Pressable>

                {/* Core Identity Section */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile Info</Text>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Display Name</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Your display name"
                            placeholderTextColor={colors.textTertiary}
                            maxLength={30}
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Username</Text>
                        <View style={[styles.handleInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                            <Text style={[styles.atSymbol, { color: colors.textSecondary }]}>@</Text>
                            <TextInput
                                style={[styles.handleInput, { color: colors.text }]}
                                value={handle}
                                onChangeText={(text) => setHandle(text.replace(/[^a-zA-Z0-9_]/g, ''))}
                                placeholder="username"
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="none"
                                autoCorrect={false}
                                maxLength={20}
                            />
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Bio</Text>
                        <TextInput
                            style={[styles.input, styles.bioInput, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]}
                            value={bio}
                            onChangeText={setBio}
                            placeholder="Tell us about yourself"
                            placeholderTextColor={colors.textTertiary}
                            multiline
                            maxLength={150}
                        />
                        <Text style={[styles.charCount, { color: colors.textTertiary }]}>{bio.length}/150</Text>
                    </View>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Location</Text>
                        <View style={[styles.iconInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                            <Feather name="map-pin" size={18} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.iconInput, { color: colors.text }]}
                                value={location}
                                onChangeText={setLocation}
                                placeholder="City, State"
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Website</Text>
                        <View style={[styles.iconInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                            <Feather name="link" size={18} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.iconInput, { color: colors.text }]}
                                value={website}
                                onChangeText={setWebsite}
                                placeholder="https://..."
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="none"
                                keyboardType="url"
                            />
                        </View>
                    </View>
                </View>

                {/* Styling rate — verified stylists only. This is the amount a
                    client's card is authorized for when they book a live session. */}
                {user?.is_verified_stylist && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Styling</Text>

                        <View style={styles.field}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Session Price</Text>
                            <View style={[styles.iconInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                                <Feather name="dollar-sign" size={18} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.iconInput, { color: colors.text }]}
                                    value={sessionPrice}
                                    onChangeText={setSessionPrice}
                                    placeholder="75"
                                    placeholderTextColor={colors.textTertiary}
                                    keyboardType="decimal-pad"
                                />
                            </View>
                            <Text style={[styles.helperText, { color: colors.textTertiary }]}>
                                $5–$500 per live session. Emode keeps {PLATFORM_CONFIG.feePercent}%;
                                the rest goes to your connected payout account. Leave empty to stop
                                taking bookings.
                            </Text>
                        </View>
                    </View>
                )}

                {/* Favorites Section */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Favorites</Text>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Favorite Brand</Text>
                        <View style={[styles.iconInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                            <Text style={{ fontSize: 18 }}>🫶</Text>
                            <TextInput
                                style={[styles.iconInput, { color: colors.text }]}
                                value={favoriteBrand}
                                onChangeText={setFavoriteBrand}
                                placeholder="Rick Owens, Nike, etc."
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Featured Song</Text>
                        <View style={[styles.iconInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, marginBottom: 8 }]}>
                            <Feather name="music" size={18} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.iconInput, { color: colors.text }]}
                                value={songTitle}
                                onChangeText={setSongTitle}
                                placeholder="Song title"
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border, marginBottom: 8 }]}
                            value={songArtist}
                            onChangeText={setSongArtist}
                            placeholder="Artist name"
                            placeholderTextColor={colors.textTertiary}
                        />
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]}
                            value={songUrl}
                            onChangeText={setSongUrl}
                            placeholder="Spotify/Apple Music link (optional)"
                            placeholderTextColor={colors.textTertiary}
                            autoCapitalize="none"
                            keyboardType="url"
                        />
                    </View>
                </View>

                {/* Social Links Section */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Social Links</Text>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Instagram</Text>
                        <View style={[styles.iconInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                            <Feather name="instagram" size={18} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.iconInput, { color: colors.text }]}
                                value={instagram}
                                onChangeText={(text) => setInstagram(text.replace('@', ''))}
                                placeholder="username"
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>TikTok</Text>
                        <View style={[styles.iconInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                            <Feather name="video" size={18} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.iconInput, { color: colors.text }]}
                                value={tiktok}
                                onChangeText={(text) => setTiktok(text.replace('@', ''))}
                                placeholder="username"
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Twitter / X</Text>
                        <View style={[styles.iconInputWrapper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                            <Feather name="twitter" size={18} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.iconInput, { color: colors.text }]}
                                value={twitter}
                                onChangeText={(text) => setTwitter(text.replace('@', ''))}
                                placeholder="username"
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
    },
    cancelButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    saveButton: {
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
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Inter_700Bold',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingBottom: 40,
    },
    // Header Image
    headerSection: {
        height: 140,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
    },
    headerImageContainer: {
        width: '100%',
        height: '100%',
        overflow: 'hidden',
    },
    dragHintOverlay: {
        position: 'absolute',
        bottom: 8,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
    },
    dragHintText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
        fontWeight: '500',
    },
    repositionControls: {
        position: 'absolute',
        top: 10,
        right: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 100,
    },
    repositionCancelButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    repositionConfirmButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(34, 197, 94, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerPlaceholderText: {
        fontSize: 14,
        marginTop: 8,
    },
    headerChangeButton: {
        position: 'absolute',
        top: 10,
        right: 10,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 16,
        gap: 4,
    },
    headerChangeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    headerButtonsRow: {
        position: 'absolute',
        top: 10,
        right: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerEditButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Avatar
    avatarSection: {
        alignItems: 'flex-start',
        marginTop: -48,
        paddingHorizontal: 20,
    },
    avatarWrapper: {
        position: 'relative',
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 4,
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 44,
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        borderRadius: 44,
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
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
    },
    // Sections
    section: {
        paddingHorizontal: 20,
        paddingTop: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        fontFamily: 'Inter_700Bold',
        marginBottom: 16,
    },
    field: {
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        marginBottom: 8,
        fontFamily: 'Inter_500Medium',
    },
    helperText: {
        fontSize: 11,
        lineHeight: 15,
        marginTop: 6,
    },
    input: {
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        borderWidth: 1,
    },
    bioInput: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    charCount: {
        fontSize: 12,
        textAlign: 'right',
        marginTop: 4,
    },
    handleInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
    },
    atSymbol: {
        fontSize: 16,
        marginRight: 2,
    },
    handleInput: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 14,
    },
    iconInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        gap: 10,
    },
    iconInput: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 14,
    },
});
