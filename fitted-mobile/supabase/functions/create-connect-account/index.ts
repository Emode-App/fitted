// @ts-nocheck
// Creates a modern controller-property Connect account for the authenticated seller.

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
        const { data: existing } = await admin.from('private_users').select('stripe_account_id').eq('id', user.id).single();
        if (existing?.stripe_account_id) return json({ accountId: existing.stripe_account_id });

        const account = await stripe.accounts.create({
            email: user.email,
            controller: {
                stripe_dashboard: { type: 'express' },
                fees: { payer: 'application' },
                losses: { payments: 'application' },
            },
            capabilities: { transfers: { requested: true } },
            business_profile: { product_description: 'Seller of physical fashion and apparel goods on emode' },
            metadata: { emode_user_id: user.id },
        }, { idempotencyKey: `emode-connect-${user.id}` });

        const { error: saveError } = await admin.from('private_users').update({
            stripe_account_id: account.id,
            stripe_onboarding_complete: false,
        }).eq('id', user.id);
        if (saveError) {
            try { await stripe.accounts.del(account.id); } catch { /* Stripe can retain for compliance. */ }
            throw saveError;
        }
        return json({ accountId: account.id });
    } catch (error: any) {
        console.error('create-connect-account failed', error?.type || error?.message);
        return json({ error: 'Could not create seller payout account' }, 500);
    }
});
