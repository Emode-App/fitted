// @ts-nocheck
// supabase/functions/create-connect-link/index.ts
// Generates a Stripe Account Link for Connect onboarding — but ONLY for the
// authenticated caller's own connected account. The account id is read
// server-side from private_users, never accepted from the request body.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.9.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data } = await supabase
            .from('private_users')
            .select('stripe_account_id')
            .eq('id', user.id)
            .single();

        if (!data?.stripe_account_id) {
            return json({ error: 'No connected account. Create one first.' }, 400);
        }

        const accountLink = await stripe.accountLinks.create({
            account: data.stripe_account_id,
            refresh_url: 'emode://stripe-refresh',
            return_url: 'emode://stripe-return',
            type: 'account_onboarding',
        });

        return json({ url: accountLink.url });
    } catch (error: any) {
        console.error('Error creating account link:', error);
        return json({ error: error.message }, 500);
    }
});
