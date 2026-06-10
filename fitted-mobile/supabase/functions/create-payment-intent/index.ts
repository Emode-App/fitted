// @ts-nocheck
// supabase/functions/create-payment-intent/index.ts
// Creates a Stripe PaymentIntent with destination charge to the stylist's Connect account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.9.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2023-10-16',
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const {
            amount, // in cents
            currency = 'usd',
            stylist_stripe_account_id,
            conversation_id,
            description,
            platform_fee_percent = 15,
            customer_email,
        } = await req.json();

        if (!amount || !stylist_stripe_account_id) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: amount, stylist_stripe_account_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Calculate platform fee (e.g., 15% of $100 = $15 → 1500 cents)
        const applicationFeeAmount = Math.round(amount * (platform_fee_percent / 100));

        // Create or retrieve a Stripe Customer for the paying client
        // In production, you'd look up the customer by user ID in your DB
        let customer: Stripe.Customer;
        if (customer_email) {
            const existing = await stripe.customers.list({ email: customer_email, limit: 1 });
            if (existing.data.length > 0) {
                customer = existing.data[0];
            } else {
                customer = await stripe.customers.create({ email: customer_email });
            }
        } else {
            customer = await stripe.customers.create({});
        }

        // Create an ephemeral key for the customer (needed by mobile SDK)
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2023-10-16' }
        );

        // Create PaymentIntent with destination charge
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            customer: customer.id,
            application_fee_amount: applicationFeeAmount,
            transfer_data: {
                destination: stylist_stripe_account_id,
            },
            metadata: {
                conversation_id: conversation_id || '',
                description: description || '',
            },
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return new Response(
            JSON.stringify({
                clientSecret: paymentIntent.client_secret,
                ephemeralKey: ephemeralKey.secret,
                customerId: customer.id,
                paymentIntentId: paymentIntent.id,
                publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error: any) {
        console.error('Error creating payment intent:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
