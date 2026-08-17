// @ts-nocheck
// Authoritative Stripe webhook for marketplace payments and Connect readiness.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@19.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2026-06-24.dahlia' });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const platformSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const connectSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');

async function required<T>(promise: PromiseLike<{ data: T; error: any }>): Promise<T> {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
}

async function paymentIntentIdFromCharge(charge: any): Promise<string | null> {
    return typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id || null;
}

serve(async (req: Request) => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const signature = req.headers.get('stripe-signature');
    if (!signature) return new Response('Missing signature', { status: 400 });
    const rawBody = await req.text();

    let event: any = null;
    for (const secret of [platformSecret, connectSecret].filter(Boolean)) {
        try {
            event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret!);
            break;
        } catch { /* Try the other endpoint secret. */ }
    }
    if (!event) return new Response('Invalid signature', { status: 400 });

    const now = new Date().toISOString();
    const { error: claimError } = await admin.from('stripe_events').insert({
        id: event.id, type: event.type, status: 'processing', attempts: 1, processed_at: null, updated_at: now,
    });
    if (claimError?.code === '23505') {
        const { data: prior } = await admin.from('stripe_events').select('status, updated_at, attempts').eq('id', event.id).single();
        if (prior?.status === 'processed') return Response.json({ received: true, duplicate: true });
        const stale = !prior?.updated_at || Date.now() - Date.parse(prior.updated_at) > 5 * 60 * 1000;
        if (prior?.status === 'processing' && !stale) return new Response('Event is already processing', { status: 409 });
        const { error } = await admin.from('stripe_events').update({
            status: 'processing', attempts: (prior?.attempts || 1) + 1, last_error: null, updated_at: now,
        }).eq('id', event.id);
        if (error) return new Response('Could not claim event', { status: 500 });
    } else if (claimError) {
        return new Response('Could not claim event', { status: 500 });
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const intent: any = event.data.object;
                const orderId = intent.metadata?.order_id;
                if (intent.metadata?.kind === 'physical_goods' && orderId) {
                    const finalized = await required(admin.rpc('finalize_marketplace_order', {
                        p_order_id: orderId,
                        p_payment_intent_id: intent.id,
                    }));
                    if (!finalized) {
                        const { data: order, error } = await admin.from('orders')
                            .select('status, stripe_payment_intent_id').eq('id', orderId).single();
                        if (error || order?.stripe_payment_intent_id !== intent.id || !['paid', 'fulfilled'].includes(order.status)) {
                            throw new Error('Order could not be finalized');
                        }
                    }
                }
                break;
            }

            // Styling sessions authorize without capturing, so they never reach
            // payment_intent.succeeded until the stylist has delivered. This is
            // the event that says the client's card is good for the amount.
            case 'payment_intent.amount_capturable_updated': {
                const intent: any = event.data.object;
                const sessionId = intent.metadata?.styling_session_id;
                if (intent.metadata?.kind === 'styling_session' && sessionId) {
                    await required(admin.from('styling_sessions')
                        .update({ status: 'scheduled' })
                        .eq('id', sessionId)
                        .eq('stripe_payment_intent_id', intent.id)
                        .eq('status', 'pending_payment'));
                }
                break;
            }

            case 'payment_intent.payment_failed':
            case 'payment_intent.canceled': {
                const intent: any = event.data.object;
                const orderId = intent.metadata?.order_id;
                if (intent.metadata?.kind === 'physical_goods' && orderId) {
                    await required(admin.rpc('release_marketplace_order', {
                        p_order_id: orderId,
                        p_reason: event.type === 'payment_intent.canceled' ? 'payment_canceled' : 'payment_failed',
                    }));
                }
                const sessionId = intent.metadata?.styling_session_id;
                if (intent.metadata?.kind === 'styling_session' && sessionId) {
                    await required(admin.from('styling_sessions').update({
                        status: 'cancelled',
                        cancelled_at: new Date().toISOString(),
                        cancel_reason: event.type === 'payment_intent.canceled' ? 'payment_canceled' : 'payment_failed',
                    }).eq('id', sessionId)
                      .eq('stripe_payment_intent_id', intent.id)
                      .in('status', ['pending_payment', 'scheduled']));
                }
                break;
            }

            case 'charge.refunded': {
                const charge: any = event.data.object;
                const intentId = await paymentIntentIdFromCharge(charge);
                if (intentId) {
                    const status = charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded';
                    await required(admin.from('orders').update({
                        status, refunded_amount: charge.amount_refunded, updated_at: now,
                    }).eq('stripe_payment_intent_id', intentId));
                }
                break;
            }

            case 'charge.dispute.created':
            case 'charge.dispute.closed': {
                const dispute: any = event.data.object;
                const intentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
                if (intentId) {
                    const update: any = { dispute_status: dispute.status, updated_at: now };
                    if (event.type === 'charge.dispute.created') update.status = 'disputed';
                    if (event.type === 'charge.dispute.closed' && dispute.status === 'lost') update.status = 'chargeback';
                    await required(admin.from('orders').update(update).eq('stripe_payment_intent_id', intentId));
                }
                break;
            }

            case 'account.updated': {
                const account: any = event.data.object;
                const ready = account.details_submitted && account.payouts_enabled && account.capabilities?.transfers === 'active';
                await required(admin.from('private_users').update({ stripe_onboarding_complete: !!ready }).eq('stripe_account_id', account.id));
                break;
            }

            default:
                break;
        }

        await required(admin.from('stripe_events').update({
            status: 'processed', processed_at: now, updated_at: now, last_error: null,
        }).eq('id', event.id));
        return Response.json({ received: true });
    } catch (error: any) {
        console.error('Stripe event processing failed', event.id, event.type, error?.message);
        await admin.from('stripe_events').update({
            status: 'failed', last_error: String(error?.message || 'processing failed').slice(0, 1000), updated_at: new Date().toISOString(),
        }).eq('id', event.id);
        return new Response('Webhook processing failed', { status: 500 });
    }
});
