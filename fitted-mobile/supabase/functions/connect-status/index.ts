// @ts-nocheck
// Queries Stripe directly; the cached database flag is never trusted for checkout.
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
    const { user, error } = await getUser(req);
    if (!user) return json({ error: error || 'Unauthorized' }, 401);
    const { data } = await admin.from('private_users').select('stripe_account_id').eq('id', user.id).single();
    if (!data?.stripe_account_id) return json({ hasAccount: false, onboardingComplete: false });
    try {
        const account: any = await stripe.accounts.retrieve(data.stripe_account_id);
        const ready = !account.deleted && account.details_submitted && account.payouts_enabled && account.capabilities?.transfers === 'active';
        await admin.from('private_users').update({ stripe_onboarding_complete: ready }).eq('id', user.id);
        return json({ hasAccount: true, onboardingComplete: ready, requirementsDue: account.requirements?.currently_due || [] });
    } catch {
        await admin.from('private_users').update({ stripe_onboarding_complete: false }).eq('id', user.id);
        return json({ hasAccount: false, onboardingComplete: false });
    }
});
