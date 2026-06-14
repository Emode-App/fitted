// @ts-nocheck
// supabase/functions/create-payment-intent/index.ts
// Creates a Stripe PaymentIntent (destination charge to the stylist's connected
// account) for an AUTHENTICATED client paying inside a conversation they belong to.
//
// Hardening vs. the original:
//   * Caller identity comes from the verified JWT.
//   * Caller must be a participant of the conversation; the stylist must be the
//     other participant. The stylist's connected account is looked up server-side
//     (never trusted from the client).
//   * The platform fee and customer/email come from the server, not the body.
//   * The ephemeral key is only ever issued for the caller's own customer.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.9.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MIN_AMOUNT = 50;        // 50 cents
const MAX_AMOUNT = 500000;    // $5,000

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        const { amount, currency = 'usd', conversation_id, stylist_user_id, description } = await req.json();

        // Validate amount (integer cents, bounded).
        if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
            return json({ error: 'Invalid amount' }, 400);
        }
        if (!conversation_id || !stylist_user_id) {
            return json({ error: 'Missing conversation_id or stylist_user_id' }, 400);
        }
        if (stylist_user_id === user.id) {
            return json({ error: 'Cannot pay yourself' }, 400);
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Authorize: caller and stylist must both be participants of the conversation.
        const { data: convo } = await supabase
            .from('conversations')
            .select('participant_ids')
            .eq('id', conversation_id)
            .single();

        if (!convo || !convo.participant_ids?.includes(user.id) || !convo.participant_ids?.includes(stylist_user_id)) {
            return json({ error: 'Not a participant of this conversation' }, 403);
        }

        // Look up the stylist's connected account server-side.
        const { data: stylistPriv } = await supabase
            .from('private_users')
            .select('stripe_account_id, stripe_onboarding_complete')
            .eq('id', stylist_user_id)
            .single();

        if (!stylistPriv?.stripe_account_id || !stylistPriv.stripe_onboarding_complete) {
            return json({ error: 'stylist_not_connected' }, 409);
        }

        // Resolve (or create) the caller's own Stripe customer.
        const { data: callerPriv } = await supabase
            .from('private_users')
            .select('stripe_customer_id')
            .eq('id', user.id)
            .single();

        let customerId = callerPriv?.stripe_customer_id || null;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { emode_user_id: user.id },
            });
            customerId = customer.id;
            await supabase.from('private_users').update({ stripe_customer_id: customerId }).eq('id', user.id);
        }

        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customerId },
            { apiVersion: '2023-10-16' }
        );

        const feePercent = Number(Deno.env.get('PLATFORM_FEE_PERCENT') || '15');
        const applicationFeeAmount = Math.round(amount * (feePercent / 100));

        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            customer: customerId,
            application_fee_amount: applicationFeeAmount,
            transfer_data: { destination: stylistPriv.stripe_account_id },
            metadata: {
                conversation_id,
                payer_id: user.id,
                stylist_id: stylist_user_id,
                description: description || '',
            },
            automatic_payment_methods: { enabled: true },
        });

        return json({
            clientSecret: paymentIntent.client_secret,
            ephemeralKey: ephemeralKey.secret,
            customerId,
            paymentIntentId: paymentIntent.id,
            publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '',
        });
    } catch (error: any) {
        console.error('Error creating payment intent:', error);
        return json({ error: error.message }, 500);
    }
});
