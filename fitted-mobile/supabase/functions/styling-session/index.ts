// @ts-nocheck
// Lifecycle for real-time 1:1 styling sessions.
//
//   scheduled --start--> active --deliver--> delivered/completed (funds captured)
//                          |
//                          +--cancel/sweep--> cancelled/expired (authorization released)
//
// Money only moves on `deliver`, and only while the live window is open. Every
// transition is guarded by both the caller's role and the current status, so a
// replayed or out-of-order request cannot double-capture.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@19.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const API_VERSION = '2026-06-24.dahlia';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: API_VERSION });
const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

const UUID = /^[0-9a-f-]{36}$/i;

/** Release an uncaptured authorization. Safe to call on an already-dead PI. */
async function releaseAuthorization(paymentIntentId: string | null) {
    if (!paymentIntentId) return;
    try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(pi.status)) {
            await stripe.paymentIntents.cancel(paymentIntentId);
        }
    } catch (error: any) {
        console.error('could not release authorization', paymentIntentId, error?.message);
    }
}

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'content-type': 'application/json' },
    });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const input = await req.json();
        const action = String(input?.action || '');

        // The sweep is the one action with no user: it is called on a schedule to
        // close windows nobody delivered in. Guarded by a shared secret.
        if (action === 'sweep') {
            const secret = Deno.env.get('STYLING_SWEEP_SECRET') || '';
            if (!secret || req.headers.get('x-sweep-secret') !== secret) {
                return json({ error: 'Unauthorized' }, 401);
            }
            const { data: expired } = await admin.rpc('expire_stale_styling_sessions');
            for (const session of expired || []) {
                await releaseAuthorization(session.stripe_payment_intent_id);
            }
            return json({ expired: (expired || []).length });
        }

        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        const sessionId = String(input?.session_id || '');
        if (!UUID.test(sessionId)) return json({ error: 'Invalid session' }, 400);

        const { data: session } = await admin.from('styling_sessions')
            .select('*').eq('id', sessionId).single();
        if (!session) return json({ error: 'Session not found' }, 404);

        const isStylist = session.stylist_id === user.id;
        const isClient = session.client_id === user.id;
        if (!isStylist && !isClient) return json({ error: 'Session not found' }, 404);

        const now = new Date();

        if (action === 'start') {
            // Either participant can open the window; the other is pulled in by
            // the realtime subscription on the session row.
            if (session.status !== 'scheduled') {
                return json({ error: 'This session is not ready to start.' }, 409);
            }
            const endsAt = new Date(now.getTime() + (session.duration_minutes || 60) * 60_000);
            const { data: updated, error: startError } = await admin.from('styling_sessions')
                .update({ status: 'active', starts_at: now.toISOString(), ends_at: endsAt.toISOString() })
                .eq('id', sessionId).eq('status', 'scheduled')
                .select().single();
            if (startError || !updated) return json({ error: 'This session is not ready to start.' }, 409);
            return json({ session: updated });
        }

        if (action === 'deliver') {
            if (!isStylist) return json({ error: 'Only the stylist can deliver this session.' }, 403);
            if (session.status !== 'active') {
                return json({ error: 'This session is not open.' }, 409);
            }
            if (session.ends_at && new Date(session.ends_at) < now) {
                return json({ error: 'This session window has closed.' }, 409);
            }
            const messageId = String(input?.delivery_message_id || '');
            if (!UUID.test(messageId)) return json({ error: 'Invalid delivery' }, 400);

            // Claim the transition first so a duplicate request cannot capture twice.
            const { data: claimed, error: claimError } = await admin.from('styling_sessions')
                .update({
                    status: 'delivered',
                    delivered_at: now.toISOString(),
                    delivery_message_id: messageId,
                })
                .eq('id', sessionId).eq('status', 'active')
                .select().single();
            if (claimError || !claimed) return json({ error: 'This session is not open.' }, 409);

            try {
                await stripe.paymentIntents.capture(session.stripe_payment_intent_id, {
                    idempotencyKey: `emode-styling-capture-${sessionId}`,
                });
            } catch (captureError: any) {
                console.error('styling capture failed', sessionId, captureError?.message);
                // Leave the row at 'delivered'. The work was done and is visible to
                // the client; capture can be retried without redoing the delivery.
                return json({ error: 'Delivered, but the payment could not be captured yet.' }, 502);
            }

            const { data: completed } = await admin.from('styling_sessions')
                .update({ status: 'completed', completed_at: now.toISOString() })
                .eq('id', sessionId).eq('status', 'delivered')
                .select().single();
            return json({ session: completed || claimed });
        }

        if (action === 'cancel') {
            if (!['pending_payment', 'scheduled', 'active'].includes(session.status)) {
                return json({ error: 'This session can no longer be cancelled.' }, 409);
            }
            const { data: cancelled, error: cancelError } = await admin.from('styling_sessions')
                .update({
                    status: 'cancelled',
                    cancelled_at: now.toISOString(),
                    cancel_reason: isStylist ? 'cancelled_by_stylist' : 'cancelled_by_client',
                })
                .eq('id', sessionId).in('status', ['pending_payment', 'scheduled', 'active'])
                .select().single();
            if (cancelError || !cancelled) return json({ error: 'This session can no longer be cancelled.' }, 409);
            await releaseAuthorization(session.stripe_payment_intent_id);
            return json({ session: cancelled });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error: any) {
        console.error('styling-session failed', error?.type || error?.message);
        return json({ error: 'Could not update this session' }, 500);
    }
});
