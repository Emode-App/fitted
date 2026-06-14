// @ts-nocheck
// supabase/functions/create-connect-account/index.ts
// Creates a Stripe Connect Express account for the AUTHENTICATED caller.
// Identity (user id + email) is derived from the verified JWT, never the body.

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

        // Return the caller's existing account if they already have one.
        const { data: existing } = await supabase
            .from('private_users')
            .select('stripe_account_id')
            .eq('id', user.id)
            .single();

        if (existing?.stripe_account_id) {
            return json({ accountId: existing.stripe_account_id });
        }

        const account = await stripe.accounts.create({
            type: 'express',
            email: user.email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            metadata: { emode_user_id: user.id },
        });

        const { error: upsertError } = await supabase
            .from('private_users')
            .upsert({ id: user.id, stripe_account_id: account.id, stripe_onboarding_complete: false });

        if (upsertError) console.error('Failed to save account ID:', upsertError);

        return json({ accountId: account.id });
    } catch (error: any) {
        console.error('Error creating Connect account:', error);
        return json({ error: error.message }, 500);
    }
});
