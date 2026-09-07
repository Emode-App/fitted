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

/**
 * Whether to draw the button at all.
 *
 * In a release build this is simply whether it works: an end user should never
 * meet a control that cannot do anything, and hiding it is the honest choice.
 *
 * In development it is always drawn, because the opposite is worse. A native
 * module only arrives with a new binary, so while working on this against an
 * older dev client the button silently does not exist -- and "it will appear in
 * a build" is not something anyone can check. Being able to see it, position
 * it, and have it explain itself on tap is worth more during development than
 * the tidiness of hiding it, and none of that reaches anybody else.
 */
export function shouldOfferBackgroundRemoval(): boolean {
    return isBackgroundRemovalAvailable() || __DEV__;
}

/**
 * Why the button cannot do its job, phrased for whoever is looking at it.
 *
 * Specifically not "needs a new build": whoever sees this has almost certainly
 * just made one, and being told to do the thing they just did is how a correct
 * message reads as a broken app. The distinction that matters is which binary
 * is running, not whether a build exists.
 */
export function backgroundRemovalUnavailableReason(): string {
    return 'The dev client you are running was compiled before this native module was added, '
        + 'so it cannot cut anything out. Release builds have it. '
        + 'To use it while developing, build the development profile once — '
        + 'after that, reloading picks up changes as normal.';
}

/**
 * Below this, a cutout is almost certainly empty rather than small.
 *
 * A fully transparent PNG is the easiest thing PNG compression will ever be
 * handed, so it lands in the low single-digit kilobytes at any dimensions. A
 * real cutout from a phone photo does not come close to this floor.
 */
const EMPTY_RESULT_BYTES = 10 * 1024;

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

    // Vision does not fail when it cannot find a subject. It returns an empty
    // mask, and the library hands that back as a perfectly valid image that
    // happens to be entirely transparent -- which passed the check above and
    // replaced somebody's photo with nothing.
    //
    // Size is the cheap tell. Uniform alpha is the best case PNG compression
    // will ever see, so an empty result lands in the low single-digit
    // kilobytes whatever the dimensions, while a real cutout at photo
    // resolution is far larger. An absolute floor rather than a ratio of the
    // source: a small object legitimately cut from a large photo is a real
    // case, and a ratio would throw it away.
    try {
        const info = await FileSystem.getInfoAsync(result);
        const size = (info as any)?.size ?? 0;
        if (size > 0 && size < EMPTY_RESULT_BYTES) return null;
    } catch {
        // Unmeasurable is not evidence of emptiness; let it through.
    }

    return result;
}
