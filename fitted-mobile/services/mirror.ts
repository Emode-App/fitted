import { supabase } from './supabase';

/**
 * Emode Mirror, from the app's side.
 *
 * A mirror is a try-on kiosk on a Proto Luma (repo: Emode-App/emode-mirror).
 * Its QR code opens a web page; that page offers "Open in Emode", which lands
 * here as emode://mirror/<visit>?t=<token>. From there the app can claim the
 * visit for the signed-in account, send pieces straight from the wardrobe, and
 * keep finished looks in try-on history.
 *
 * Every call goes through supabase.functions.invoke, which carries the user's
 * own access token. The mirror backend needs that AND the visit token before it
 * will touch the wardrobe: one proves who, the other proves which mirror.
 */

export type MirrorCategory = 'tops' | 'outerwear' | 'bottoms' | 'shoes' | 'accessories' | 'other';

export interface MirrorGarment {
    id: string;
    source: 'upload' | 'link' | 'wardrobe';
    category: MirrorCategory | null;
    title: string | null;
    productUrl: string | null;
    imageUrl: string | null;
}

export interface MirrorLook {
    id: string;
    status: 'pending' | 'succeeded' | 'failed';
    error: string | null;
    garmentIds: string[];
    imageUrl: string | null;
    createdAt: string;
}

export interface MirrorVisit {
    id: string;
    status: 'active' | 'ended';
    linked: boolean;
    hasPhoto: boolean;
    retainUntil: string | null;
    garments: MirrorGarment[];
    looks: MirrorLook[];
    device: { name: string | null; location: string | null };
    limits: { garmentsPerSession: number };
}

export class MirrorError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
    }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('mirror', { body });
    if (error) {
        // invoke wraps non-2xx responses; the mirror's own message is in the body.
        let message = 'Could not reach the mirror. Try again.';
        let code: string | undefined;
        try {
            const payload = await (error as any).context?.json?.();
            if (payload?.error) message = payload.error;
            code = payload?.code;
        } catch { /* keep the generic message */ }
        throw new MirrorError(message, code);
    }
    return data as T;
}

export const mirror = {
    state: (sessionId: string, token: string) =>
        call<MirrorVisit>({ action: 'phone.state', sessionId, token }),

    link: (sessionId: string, token: string) =>
        call<{ ok: true }>({ action: 'phone.link', sessionId, token }),

    sendFromWardrobe: (sessionId: string, token: string, urls: string[]) =>
        call<{ added: number; skipped: string[] }>({ action: 'garment.from_wardrobe', sessionId, token, urls }),

    removeGarment: (sessionId: string, token: string, garmentId: string) =>
        call<{ ok: true }>({ action: 'garment.remove', sessionId, token, garmentId }),

    saveLook: (sessionId: string, token: string, lookId: string) =>
        call<{ ok: true; alreadySaved?: boolean }>({ action: 'look.save', sessionId, token, lookId }),
};

// ─────────────────────────────────────────────── surviving the sign-in gate ──

/**
 * A mirror link that arrived before anyone was signed in.
 *
 * The root layout sends a signed-out user to /auth and, once they are in, on
 * to the tabs -- which would quietly drop the mirror they were trying to reach.
 * The link is parked here on arrival and the layout picks it back up after
 * sign-in. Memory only: a mirror visit lasts minutes, not app restarts.
 */
let pending: string | null = null;

// Only the app's own scheme. A web link that merely looks like a mirror path
// should not be able to open a visit in the signed-in app.
const MIRROR_LINK = /^emode:\/\/mirror\/([0-9a-f-]{36})\?t=([A-Za-z0-9_-]+)/i;

/** The in-app route for a mirror link, or null if this URL is not one. */
export function mirrorRouteFromUrl(url: string | null | undefined): string | null {
    const m = url?.match(MIRROR_LINK);
    return m ? `/mirror/${m[1]}?t=${m[2]}` : null;
}

export function rememberMirrorLink(url: string | null | undefined) {
    const route = mirrorRouteFromUrl(url);
    if (route) pending = route;
}

export function takePendingMirrorRoute(): string | null {
    const route = pending;
    pending = null;
    return route;
}
