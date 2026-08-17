// Native Expo push notification registration and response handling.

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const isExpoGo = Constants.appOwnership === 'expo';
const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId;

let registeredToken: string | null = null;
let handlerSet = false;

function ensureHandler() {
    if (handlerSet) return;
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
    handlerSet = true;
}

export async function registerForPush(userId: string): Promise<boolean> {
    if (isExpoGo) return false;
    try {
        ensureHandler();

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.DEFAULT,
            });
        }

        if (!Device.isDevice) return false;

        let status = (await Notifications.getPermissionsAsync()).status;
        if (status !== 'granted') {
            status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status !== 'granted') return false;

        const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        const token = tokenResponse?.data;
        if (!token) return false;

        const { error } = await supabase.from('push_tokens').upsert(
            { token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() },
            { onConflict: 'token' },
        );
        if (error) {
            console.warn('Push token save failed:', error.message);
            return false;
        }
        registeredToken = token;
        return true;
    } catch (error: any) {
        console.warn('Push registration failed:', error?.message || error);
        return false;
    }
}

export function addNotificationResponseListener(
    handler: (data: Record<string, any>) => void,
): () => void {
    if (isExpoGo) return () => {};
    ensureHandler();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        handler((response.notification.request.content.data ?? {}) as Record<string, any>);
    });

    Notifications.getLastNotificationResponseAsync()
        .then((response) => {
            if (response) handler((response.notification.request.content.data ?? {}) as Record<string, any>);
        })
        .catch(() => {});

    return () => subscription.remove();
}

export async function unregisterPush(): Promise<void> {
    if (!registeredToken) return;
    try {
        await supabase.from('push_tokens').delete().eq('token', registeredToken);
    } catch {
        // Best effort: local sign-out must still complete.
    }
    registeredToken = null;
}
