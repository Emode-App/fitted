// @ts-nocheck
// supabase/functions/create-connect-account/index.ts
// Creates a Stripe Connect Express account for stylists

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.9.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id, email } = await req.json();

        if (!user_id || !email) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: user_id, email' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check if user already has a Connect account
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: user } = await supabase
            .from('users')
            .select('stripe_account_id')
            .eq('id', user_id)
            .single();

        if (user?.stripe_account_id) {
            return new Response(
                JSON.stringify({ accountId: user.stripe_account_id }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create Stripe Connect Express account
        const account = await stripe.accounts.create({
            type: 'express',
            email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            metadata: {
                emode_user_id: user_id,
            },
        });

        // Save the account ID to the user's record
        const { error: updateError } = await supabase
            .from('users')
            .update({
                stripe_account_id: account.id,
                stripe_onboarding_complete: false,
            })
            .eq('id', user_id);

        if (updateError) {
            console.error('Failed to save account ID:', updateError);
        }

        return new Response(
            JSON.stringify({ accountId: account.id }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error: any) {
        console.error('Error creating Connect account:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
