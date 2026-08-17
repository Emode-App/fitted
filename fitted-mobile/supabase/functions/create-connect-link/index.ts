// @ts-nocheck
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
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);
        const { data } = await admin.from('private_users').select('stripe_account_id').eq('id', user.id).single();
        if (!data?.stripe_account_id) return json({ error: 'Create a seller payout account first' }, 409);
        const link = await stripe.accountLinks.create({
            account: data.stripe_account_id,
            refresh_url: 'emode://stripe-refresh',
            return_url: 'emode://stripe-return',
            type: 'account_onboarding',
            collection_options: { fields: 'eventually_due' },
        });
        return json({ url: link.url });
    } catch (error: any) {
        console.error('create-connect-link failed', error?.type || error?.message);
        return json({ error: 'Could not start Stripe onboarding' }, 500);
    }
});
