// @ts-nocheck
// supabase/functions/sync-entitlement/index.ts
// Server-side source of truth for paid entitlements. The client may ASK to
// sync, but this function independently verifies the caller's active
// entitlements with RevenueCat (using a secret API key) before writing the
// is_verified_stylist / is_business_account / subscription_status flags.
// Those columns are otherwise locked against client writes by a DB trigger.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const revenueCatSecret = Deno.env.get('REVENUECAT_SECRET_KEY');

const ENTITLEMENTS = {
    verifiedStylist: 'verified_stylist',
    businessAccount: 'business_account',
    proTryOns: 'pro_tryons',
};

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        if (!revenueCatSecret) {
            return json({ error: 'Entitlement verification not configured' }, 500);
        }

        // Look up the subscriber by their Supabase user id (the app calls
        // Purchases.logIn(user.id), so the RevenueCat app_user_id matches).
        const rcResp = await fetch(`https://api.revenuecat.com/v1/subscribers/${user.id}`, {
            headers: { Authorization: `Bearer ${revenueCatSecret}` },
        });

        if (!rcResp.ok) {
            console.error('RevenueCat lookup failed:', rcResp.status);
            return json({ error: 'Could not verify subscription' }, 502);
        }

        const rcBody = await rcResp.json();
        const active = rcBody?.subscriber?.entitlements || {};
        const now = Date.now();

        const isActive = (id: string): boolean => {
            const ent = active[id];
            if (!ent) return false;
            const exp = ent.expires_date ? Date.parse(ent.expires_date) : Infinity;
            return exp > now;
        };

        const verified = isActive(ENTITLEMENTS.verifiedStylist);
        const business = isActive(ENTITLEMENTS.businessAccount);
        const pro = isActive(ENTITLEMENTS.proTryOns);

        const subscription_status = (verified || business || pro) ? 'active' : 'none';

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { error: updateError } = await supabase
            .from('users')
            .update({
                is_verified_stylist: verified,
                is_business_account: business,
                has_pro_tryons: pro,
                subscription_status,
            })
            .eq('id', user.id);

        if (updateError) {
            console.error('Failed to write entitlements:', updateError);
            return json({ error: 'Failed to persist entitlements' }, 500);
        }

        return json({
            is_verified_stylist: verified,
            is_business_account: business,
            has_pro_tryons: pro,
            subscription_status,
        });
    } catch (error: any) {
        console.error('sync-entitlement error:', error);
        return json({ error: error.message }, 500);
    }
});
