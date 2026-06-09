// @ts-nocheck
// supabase/functions/stripe-webhook/index.ts
// Handles Stripe webhook events for payment and Connect account updates

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.9.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const connectWebhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200 });
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
        return new Response('Missing stripe-signature header', { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;

    let verified = false;
    let verificationError: any = null;

    if (webhookSecret) {
        try {
            event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
            verified = true;
        } catch (err: any) {
            verificationError = err;
        }
    }

    if (!verified && connectWebhookSecret) {
        try {
            event = stripe.webhooks.constructEvent(body, signature, connectWebhookSecret);
            verified = true;
        } catch (err: any) {
            verificationError = err;
        }
    }

    if (!verified) {
        console.error('Webhook signature verification failed:', verificationError?.message || 'No signing secrets configured');
        return new Response(`Webhook Error: ${verificationError?.message || 'No secrets configured'}`, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        switch (event.type) {
            // ─── Payment succeeded ───────────────────────────────────
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                const conversationId = paymentIntent.metadata?.conversation_id;

                if (conversationId) {
                    // Update the styling session status
                    const { error } = await supabase
                        .from('styling_sessions')
                        .update({
                            status: 'completed',
                            stripe_payment_intent_id: paymentIntent.id,
                            completed_at: new Date().toISOString(),
                        })
                        .eq('conversation_id', conversationId)
                        .eq('status', 'pending');

                    if (error) console.error('Error updating session:', error);

                    // Also update the payment_request status on the message
                    // Find messages with pending payment requests in this conversation
                    const { data: messages } = await supabase
                        .from('messages')
                        .select('id, payment_request')
                        .eq('conversation_id', conversationId)
                        .not('payment_request', 'is', null);

                    if (messages) {
                        for (const msg of messages) {
                            if (msg.payment_request?.status === 'pending') {
                                await supabase
                                    .from('messages')
                                    .update({
                                        payment_request: {
                                            ...msg.payment_request,
                                            status: 'completed',
                                            transaction_id: paymentIntent.id,
                                        },
                                    })
                                    .eq('id', msg.id);
                            }
                        }
                    }
                }
                break;
            }

            // ─── Payment failed ──────────────────────────────────────
            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                const conversationId = paymentIntent.metadata?.conversation_id;

                if (conversationId) {
                    await supabase
                        .from('styling_sessions')
                        .update({ status: 'declined' })
                        .eq('conversation_id', conversationId)
                        .eq('status', 'pending');
                }
                break;
            }

            // ─── Connect account updated ─────────────────────────────
            case 'account.updated': {
                const account = event.data.object as Stripe.Account;
                const chargesEnabled = account.charges_enabled;
                const detailsSubmitted = account.details_submitted;

                if (chargesEnabled && detailsSubmitted) {
                    // Mark onboarding as complete
                    const { error } = await supabase
                        .from('users')
                        .update({ stripe_onboarding_complete: true })
                        .eq('stripe_account_id', account.id);

                    if (error) console.error('Error updating onboarding status:', error);
                }
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    } catch (error: any) {
        console.error('Error processing webhook:', error);
        return new Response(`Webhook handler error: ${error.message}`, { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
    });
});
