import { supabase } from './supabase';
import { captureException } from './monitoring';
import type { StylingSession, StylingSessionStatus } from '@/types';

// ============================================
// STYLING SESSIONS
// Real-time 1:1 paid styling. Every amount and every status transition is
// decided server-side; this module only asks and reports. See
// supabase/functions/create-styling-session and styling-session.
// ============================================

/** Statuses where the session is live enough to show session UI in the chat. */
export const OPEN_STATUSES: StylingSessionStatus[] = ['pending_payment', 'scheduled', 'active', 'delivered'];

export interface BookingIntent {
    clientSecret: string;
    ephemeralKey: string;
    customerId: string;
    sessionId: string;
    amount: number;
    currency: string;
    durationMinutes: number;
    publishableKey: string;
}

function reason(error: any, fallback: string): string {
    let message = error?.message || fallback;
    try {
        const body = error?.context?.json?.();
        if (body?.error) message = body.error;
    } catch {
        // keep the fallback
    }
    return message;
}

/**
 * Reserve a session and authorize payment for it. Returns everything the
 * PaymentSheet needs. The card is authorized, not charged -- the stylist is
 * only paid once they deliver inside the live window.
 */
export async function createBookingIntent(
    stylistId: string,
    conversationId: string,
    durationMinutes = 60,
): Promise<BookingIntent> {
    const { data, error } = await supabase.functions.invoke('create-styling-session', {
        body: { stylist_id: stylistId, conversation_id: conversationId, duration_minutes: durationMinutes },
    });
    if (error) {
        const message = reason(error, 'Could not start this session');
        // A stylist without payouts set up is an expected state, not a fault.
        if (message !== 'stylist_not_connected') {
            captureException(error, { feature: 'create-styling-session', stylistId });
        }
        throw new Error(message);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as BookingIntent;
}

async function transition(action: 'start' | 'deliver' | 'cancel', body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('styling-session', {
        body: { action, ...body },
    });
    if (error) throw new Error(reason(error, 'Could not update this session'));
    if ((data as any)?.error) throw new Error((data as any).error);
    return (data as any)?.session as StylingSession;
}

/** Open the live window. Either participant may start it. */
export const startSession = (sessionId: string) => transition('start', { session_id: sessionId });

/** Stylist delivered inside the window -- this is what captures the payment. */
export const deliverSession = (sessionId: string, deliveryMessageId: string) =>
    transition('deliver', { session_id: sessionId, delivery_message_id: deliveryMessageId });

/** Release the authorization. Available to either party before delivery. */
export const cancelSession = (sessionId: string) => transition('cancel', { session_id: sessionId });

/** The one open session for a conversation, if any. */
export async function getOpenSession(conversationId: string): Promise<StylingSession | null> {
    const { data, error } = await supabase
        .from('styling_sessions')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', OPEN_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) return null;
    return (data as StylingSession) || null;
}

/** Milliseconds left in an active window, or 0 when it has closed. */
export function remainingMs(session: StylingSession | null): number {
    if (!session?.ends_at || session.status !== 'active') return 0;
    return Math.max(0, new Date(session.ends_at).getTime() - Date.now());
}

export function formatRemaining(ms: number): string {
    const total = Math.floor(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** A stylist's advertised per-session price, in cents, or null if unset. */
export async function getStylistRateCents(stylistId: string): Promise<number | null> {
    const { data } = await supabase
        .from('users')
        .select('styling_rate_cents')
        .eq('id', stylistId)
        .single();
    return data?.styling_rate_cents ?? null;
}

export async function setStylingRateCents(cents: number | null): Promise<{ error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'You must be signed in.' };
    if (cents !== null && (cents < 500 || cents > 50000)) {
        return { error: 'Session price must be between $5 and $500.' };
    }
    const { error } = await supabase.from('users')
        .update({ styling_rate_cents: cents })
        .eq('id', user.id);
    return error ? { error: error.message } : {};
}
