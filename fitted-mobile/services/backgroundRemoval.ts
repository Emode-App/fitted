import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/services/supabase';

/**
 * Cutting an item out of its background.
 *
 * This ran on the device first, through Vision, and that was the wrong call
 * twice over. Vision's subject lifting needs iOS 17 and only exists in a native
 * build -- so it could not be worked on without spending a build each time --
 * and the package wrapping it segments *people*, which finds nothing whatever
 * in a photograph of jeans on a floor. Every photo in this app is a garment,
 * usually with nobody in it.
 *
 * So it runs on a segmentation model behind ai-proxy instead. Same class of
 * model the browser tools load into WASM, except a server runs it, which means
 * this file is a fetch and a file write: no native module, no build to see a
 * change, and it works the same on every device and OS version.
 *
 * Deliberately not an image model. Those do not reliably return an alpha
 * channel, and a background "removed" to white stops being removed the moment
 * two items overlap on the canvas.
 */

const isRemote = (uri: string) => uri.startsWith('http://') || uri.startsWith('https://');

/**
 * Nothing to gate on any more -- there is no native module to be missing, so
 * the button can always be drawn. Kept as a function because both call sites
 * ask, and a constant true is easier to delete later than a scattered one.
 */
export function isBackgroundRemovalAvailable(): boolean {
    return true;
}

export function shouldOfferBackgroundRemoval(): boolean {
    return true;
}

export function backgroundRemovalUnavailableReason(): string {
    return 'Background removal is temporarily unavailable.';
}

/**
 * Returns a local URI for the cut-out image, or null when nothing was produced.
 *
 * Null covers every way this comes back empty-handed -- no subject found, the
 * service not configured, the network gone -- and in all of them the caller
 * leaves the original picture exactly as it was.
 */
export async function cutOutBackground(uri: string): Promise<string | null> {
    if (!uri) return null;

    try {
        let source = uri;

        if (isRemote(uri)) {
            const local = `${FileSystem.cacheDirectory}cutout_src_${Date.now()}.jpg`;
            const download = await FileSystem.downloadAsync(uri, local);
            if (download.status !== 200) return null;
            source = download.uri;
        }

        const imageBase64 = await FileSystem.readAsStringAsync(source, {
            encoding: FileSystem.EncodingType.Base64,
        });

        const { data, error } = await supabase.functions.invoke('ai-proxy', {
            body: { action: 'remove-background', imageBase64 },
        });

        if (error || !data?.imageBase64) {
            console.warn('Background removal failed:', error?.message ?? 'no image returned');
            return null;
        }

        // PNG, because the whole point of the round trip is the alpha channel
        // and a .jpg extension would invite something downstream to flatten it.
        const target = `${FileSystem.cacheDirectory}cutout_${Date.now()}.png`;
        await FileSystem.writeAsStringAsync(target, data.imageBase64, {
            encoding: FileSystem.EncodingType.Base64,
        });

        return target;
    } catch (error: any) {
        console.warn('Background removal failed:', error?.message ?? error);
        return null;
    }
}
