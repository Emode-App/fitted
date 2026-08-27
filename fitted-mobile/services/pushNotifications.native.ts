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

        // Through the RPC rather than a direct upsert: if this device was
        // previously registered by another account, the row still belongs to
        // them and the update arm fails the RLS USING check. The function
        // reassigns it, and takes the user id from auth.uid() rather than from
        // us, so a token cannot be pointed at somebody else.
        const { error } = await supabase.rpc('register_push_token', {
            p_token: token,
            p_platform: Platform.OS,
        });
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

/**
 * This device's push token, or null -- without ever prompting.
 *
 * getPermissionsAsync only reports; it is requestPermissionsAsync that asks.
 * The difference matters: rebinding a token on sign-in must not throw a
 * permission dialog at somebody who is just logging in.
 */
async function currentDeviceToken(): Promise<string | null> {
    if (isExpoGo || !Device.isDevice) return null;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    try {
        const response = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        return response?.data ?? null;
    } catch {
        return null;
    }
}

/**
 * The number on the app icon.
 *
 * Driven by our own counts rather than by the push payload, which is why the
 * handler above leaves shouldSetBadge false. A payload carries whatever the
 * sender put in it at send time, and that is wrong the moment the person reads
 * something on another device. This is called with unread notifications plus
 * unread messages whenever either changes, so the icon agrees with the app.
 *
 * Android has no icon badge of this kind. setBadgeCountAsync is a no-op there
 * rather than an error, so there is nothing to branch on.
 */
export async function setAppIconBadge(count: number): Promise<void> {
    try {
        await Notifications.setBadgeCountAsync(Math.max(0, count));
    } catch (error) {
        // A badge that will not set is not worth interrupting anything over.
        console.warn('Could not set the app icon badge:', error);
    }
}

/**
 * Point this device's token at whoever is signed in now.
 *
 * A token belongs to a device, not to an account, and push_tokens maps it to
 * exactly one user. Registration only ever happened from the notifications
 * toggle in settings, so the row kept pointing at whichever account first
 * turned it on -- and that account's messages kept arriving on this phone after
 * signing out of it and into another one. Somebody else's notifications on your
 * lock screen is a privacy problem, not a curiosity.
 *
 * Silent by design: it does nothing unless notifications were already allowed.
 *
 * The userId argument is now only used to decide whether there is anyone to
 * sync for. The row's owner comes from auth.uid() inside register_push_token,
 * because a client that can name the user is a client that can hand somebody
 * else's notifications to itself.
 */
export async function syncPushToken(userId: string): Promise<void> {
    if (!userId) return;
    const token = await currentDeviceToken();
    if (!token) return;

    const { error } = await supabase.rpc('register_push_token', {
        p_token: token,
        p_platform: Platform.OS,
    });
    if (error) {
        console.warn('Push token sync failed:', error.message);
        return;
    }
    registeredToken = token;
}

export async function unregisterPush(): Promise<void> {
    // registeredToken is only set when this app session did the registering, so
    // after a restart it is null and this used to return having done nothing --
    // leaving the row behind on every sign-out that followed a cold start.
    const token = registeredToken ?? await currentDeviceToken();
    if (!token) return;
    try {
        await supabase.from('push_tokens').delete().eq('token', token);
    } catch {
        // Best effort: local sign-out must still complete.
    }
    registeredToken = null;
}
