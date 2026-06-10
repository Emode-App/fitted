// @ts-nocheck
// supabase/functions/create-connect-link/index.ts
// Generates a Stripe Account Link for Connect onboarding

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
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { stripe_account_id } = await req.json();

        if (!stripe_account_id) {
            return new Response(
                JSON.stringify({ error: 'Missing stripe_account_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create an Account Link for Express onboarding
        // These URLs use the app's deep link scheme to return to the app
        const accountLink = await stripe.accountLinks.create({
            account: stripe_account_id,
            refresh_url: 'emode://stripe-refresh',
            return_url: 'emode://stripe-return',
            type: 'account_onboarding',
        });

        return new Response(
            JSON.stringify({ url: accountLink.url }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error: any) {
        console.error('Error creating account link:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
