// @ts-nocheck
// "Review Payout Account" had nowhere to go.
//
// The button changed its label once onboarding finished but kept the same
// handler, so tapping it reopened the setup flow somebody had just completed.
// Reviewing an account is a different thing from creating one: Stripe hosts
// that screen, and this mints the one-time link to it.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@19.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2026-06-24.dahlia' });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        // The account is read from the caller's own row, never taken from the
        // request, so nobody can mint a dashboard link for someone else's
        // payouts by passing an account id.
        const { data } = await admin
            .from('private_users')
            .select('stripe_account_id, stripe_onboarding_complete')
            .eq('id', user.id)
            .single();

        if (!data?.stripe_account_id) return json({ error: 'No payout account yet' }, 409);
        if (!data.stripe_onboarding_complete) return json({ error: 'Finish payout setup first' }, 409);

        const link = await stripe.accounts.createLoginLink(data.stripe_account_id);
        return json({ url: link.url });
    } catch (error: any) {
        console.error('create-connect-login-link failed', error?.type, error?.message, error?.param ?? '');
        return json({ error: 'Could not open your payout account' }, 500);
    }
});
