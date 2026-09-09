import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from './supabase';

/**
 * "Active now".
 *
 * The label and the green dot existed long before anything recorded whether a
 * person was actually there -- both were gated on show_activity_status alone,
 * so every profile in the app claimed to be online at all times. This is the
 * half that was missing.
 *
 * The rules are deliberately dumb: while the app is in the foreground it says
 * so every couple of minutes, and while it is not, it says nothing. Presence
 * then decays on its own -- no goodbye message to deliver, which matters
 * because the app is very often killed rather than closed, and a backgrounded
 * phone gets no chance to send one.
 */

/** How often the app says it is here. */
const HEARTBEAT_MS = 2 * 60 * 1000;

/**
 * How stale a heartbeat may be and still count as "now". Comfortably more than
 * two heartbeats, so one dropped request does not blink somebody offline.
 */
export const PRESENCE_WINDOW_MS = 5 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let subscription: { remove: () => void } | null = null;
let signedIn = false;

async function beat(): Promise<void> {
    if (!signedIn) return;
    // The server takes the identity from the JWT and the time from its own
    // clock, and writes nothing at all if this account has activity status
    // turned off. Failure here is not worth surfacing -- the worst case is
    // that someone looks offline for a few minutes.
    const { error } = await supabase.rpc('touch_presence');
    if (error) console.warn('[presence] heartbeat failed:', error.message);
}

function onAppStateChange(next: AppStateStatus): void {
    if (next === 'active') {
        beat();
        if (!timer) timer = setInterval(beat, HEARTBEAT_MS);
    } else if (timer) {
        // Nothing is sent on the way out. The last heartbeat simply ages past
        // the window, and they stop reading as active without any further
        // cooperation from a phone that may already be asleep.
        clearInterval(timer);
        timer = null;
    }
}

/** Begin reporting presence for the signed-in account. Safe to call twice. */
export function startPresence(): void {
    signedIn = true;
    if (!subscription) {
        subscription = AppState.addEventListener('change', onAppStateChange);
    }
    onAppStateChange(AppState.currentState);
}

/**
 * Stop reporting, on sign-out.
 *
 * No attempt is made to blank the timestamp: signing out is not the same as
 * going private, and the value ages out within the window regardless.
 */
export function stopPresence(): void {
    signedIn = false;
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    if (subscription) {
        subscription.remove();
        subscription = null;
    }
}

/**
 * Whether a profile should read as active.
 *
 * Both halves are required. The setting is the person's own choice and is
 * respected even if a timestamp somehow survived it; the timestamp is what
 * makes the claim true rather than decorative.
 */
export function isActiveNow(user: {
    show_activity_status?: boolean;
    last_active_at?: string | null;
} | null | undefined): boolean {
    if (!user) return false;
    if (user.show_activity_status === false) return false;
    if (!user.last_active_at) return false;
    const seen = Date.parse(user.last_active_at);
    if (Number.isNaN(seen)) return false;
    return Date.now() - seen < PRESENCE_WINDOW_MS;
}
