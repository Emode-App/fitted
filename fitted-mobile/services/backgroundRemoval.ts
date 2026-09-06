import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Cutting an item out of its background, on the device.
 *
 * iOS Vision and Android ML Kit both do this natively -- on iOS it is the same
 * subject lift as Photos -- so it costs nothing per use, runs offline, and
 * returns real alpha. Sending the picture to an image model instead would bill
 * for every tap and, more to the point, would not reliably come back
 * transparent: a background "removed" to white stops being removed the moment
 * two items overlap.
 *
 * Everything here is arranged around one rule: never let a missing native
 * module throw. react-native-background-remover is unusually good at throwing
 * -- its entry point returns a Proxy that throws on first property access, and
 * its TurboModule spec calls getEnforcing at module scope -- and either one
 * turns "this build cannot do it" into a crash. So the module is required
 * lazily, and only after a check that returns false instead of throwing.
 */

let cachedAvailability: boolean | undefined;

export function isBackgroundRemovalAvailable(): boolean {
    if (cachedAvailability !== undefined) return cachedAvailability;

    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        cachedAvailability = false;
        return false;
    }

    // get, never getEnforcing: the enforcing variant throws, and it reports to
    // LogBox and Sentry on the way out, so even catching it leaves a red screen
    // and a fatal-looking issue in the dashboard.
    try {
        if (TurboModuleRegistry.get?.('BackgroundRemover')) {
            cachedAvailability = true;
            return true;
        }
    } catch {
        // fall through to the legacy bridge rather than deciding from a throw
    }

    try {
        cachedAvailability = !!(NativeModules as any)?.BackgroundRemover;
    } catch {
        cachedAvailability = false;
    }
    return cachedAvailability;
}

const isRemote = (uri: string) => uri.startsWith('http://') || uri.startsWith('https://');

/**
 * Returns a local URI for the cut-out image.
 *
 * Null means nothing was produced and the caller should leave the picture
 * alone: the module is absent, the source could not be fetched, or this is a
 * simulator -- which returns the URI it was given rather than failing, so an
 * unchanged path is treated as "nothing happened" instead of a silent no-op
 * dressed up as success.
 */
export async function cutOutBackground(uri: string): Promise<string | null> {
    if (!uri || !isBackgroundRemovalAvailable()) return null;

    let source = uri;

    if (isRemote(uri)) {
        const local = `${FileSystem.cacheDirectory}cutout_src_${Date.now()}.jpg`;
        const download = await FileSystem.downloadAsync(uri, local);
        if (download.status !== 200) return null;
        source = download.uri;
    }

    const { removeBackground } = require('react-native-background-remover');
    const result: string = await removeBackground(source);

    if (!result || result === source) return null;
    return result;
}
