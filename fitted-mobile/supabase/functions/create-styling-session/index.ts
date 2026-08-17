// @ts-nocheck
// Books a real-time 1:1 styling session and authorizes payment for it.
//
// Apple App Review Guideline 3.1.3(d) permits collecting this outside of
// in-app purchase because the service is a real-time person-to-person
// experience between two individuals. The live window is what makes that true,
// so the session is created with an explicit duration and is only capturable
// once the stylist has delivered inside that window.
//
// Funds are AUTHORIZED here (capture_method: 'manual') and captured later by
// complete-styling-session. A stylist who never shows never gets paid, and the
// client's authorization is released rather than refunded.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@19.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts';

const API_VERSION = '2026-06-24.dahlia';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: API_VERSION });
const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

const UUID = /^[0-9a-f-]{36}$/i;

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'content-type': 'application/json' },
    });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let sessionId: string | null = null;
    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        const limit = await checkRateLimit(user.id, 'styling:book-session', 10, 3600);
        if (!limit.allowed) return rateLimitResponse(limit, cors);

        const input = await req.json();
        const stylistId = String(input?.stylist_id || '');
        const conversationId = String(input?.conversation_id || '');
        const duration = Number(input?.duration_minutes || 60);
        if (!UUID.test(stylistId) || !UUID.test(conversationId)) {
            return json({ error: 'Invalid stylist or conversation' }, 400);
        }
        if (stylistId === user.id) return json({ error: 'You cannot book yourself' }, 400);

        // The caller must actually be in the conversation they claim.
        const { data: convo } = await admin.from('conversations')
            .select('participant_ids').eq('id', conversationId).single();
        const participants: string[] = convo?.participant_ids || [];
        if (!participants.includes(user.id) || !participants.includes(stylistId)) {
            return json({ error: 'Invalid stylist or conversation' }, 403);
        }

        // The stylist must be able to receive money before we take any.
        const { data: stylistPrivate } = await admin.from('private_users')
            .select('stripe_account_id').eq('id', stylistId).single();
        if (!stylistPrivate?.stripe_account_id) return json({ error: 'stylist_not_connected' }, 409);

        let account: any;
        try { account = await stripe.accounts.retrieve(stylistPrivate.stripe_account_id); }
        catch { return json({ error: 'stylist_not_connected' }, 409); }
        const ready = !account.deleted && account.details_submitted && account.payouts_enabled
            && account.capabilities?.transfers === 'active';
        if (!ready) return json({ error: 'stylist_not_connected' }, 409);

        const feePercent = Math.min(30, Math.max(0, Number(Deno.env.get('PLATFORM_FEE_PERCENT') || '15')));
        const { data: reservation, error: reserveError } = await admin.rpc('reserve_styling_session', {
            p_client_id: user.id,
            p_stylist_id: stylistId,
            p_conversation_id: conversationId,
            p_duration_minutes: duration,
            p_fee_percent: feePercent,
        });
        if (reserveError || !reservation?.session_id) {
            const message = reserveError?.message || '';
            if (/session_already_open/.test(message)) {
                return json({ error: 'You already have an open session with this stylist.' }, 409);
            }
            if (/stylist_unavailable/.test(message)) {
                return json({ error: 'This stylist is not taking sessions right now.' }, 409);
            }
            console.error('styling session reservation failed', message);
            return json({ error: 'Could not start this session' }, 500);
        }
        sessionId = reservation.session_id;

        const { data: client } = await admin.from('private_users')
            .select('stripe_customer_id').eq('id', user.id).single();
        let customerId = client?.stripe_customer_id || null;
        if (customerId) {
            try { await stripe.customers.retrieve(customerId); } catch { customerId = null; }
        }
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { emode_user_id: user.id },
            }, { idempotencyKey: `emode-customer-${user.id}` });
            customerId = customer.id;
            const { error: saveError } = await admin.from('private_users')
                .update({ stripe_customer_id: customerId }).eq('id', user.id);
            if (saveError) throw saveError;
        }

        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customerId },
            { apiVersion: API_VERSION },
        );

        // automatic_payment_methods surfaces whatever is enabled on the account,
        // which is how Apple Pay and Cash App Pay reach the sheet without any
        // per-method integration here.
        const paymentIntent = await stripe.paymentIntents.create({
            amount: reservation.amount_cents,
            currency: reservation.currency || 'usd',
            customer: customerId,
            receipt_email: user.email,
            capture_method: 'manual',
            application_fee_amount: reservation.platform_fee_cents,
            transfer_data: { destination: stylistPrivate.stripe_account_id },
            description: 'Emode styling session',
            metadata: {
                styling_session_id: sessionId,
                client_id: user.id,
                stylist_id: stylistId,
                kind: 'styling_session',
            },
            automatic_payment_methods: { enabled: true },
        }, { idempotencyKey: `emode-styling-${sessionId}` });
        if (!paymentIntent.client_secret) throw new Error('PaymentIntent missing client secret');

        const { error: updateError } = await admin.from('styling_sessions')
            .update({ stripe_payment_intent_id: paymentIntent.id })
            .eq('id', sessionId).eq('status', 'pending_payment');
        if (updateError) throw updateError;

        return json({
            clientSecret: paymentIntent.client_secret,
            ephemeralKey: ephemeralKey.secret,
            customerId,
            sessionId,
            amount: reservation.amount_cents,
            currency: reservation.currency || 'usd',
            durationMinutes: Math.max(15, Math.min(180, duration || 60)),
            publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '',
        });
    } catch (error: any) {
        console.error('create-styling-session failed', error?.type || error?.message);
        if (sessionId) {
            await admin.from('styling_sessions').update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancel_reason: 'payment_initialization_failed',
            }).eq('id', sessionId).eq('status', 'pending_payment');
        }
        return json({ error: 'Could not start this session' }, 500);
    }
});
