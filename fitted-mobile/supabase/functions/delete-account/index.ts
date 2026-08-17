// @ts-nocheck
// Immediate in-app account deletion. Identity comes only from the verified JWT.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

async function removeFolder(bucket: string, prefix: string) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw error;
    const files = (data || []).filter((entry: any) => entry.id).map((entry: any) => `${prefix}/${entry.name}`);
    if (files.length) {
        const { error: removeError } = await admin.storage.from(bucket).remove(files);
        if (removeError) throw removeError;
    }
}

async function deleteProcessorProfiles(userId: string, privateUser: any) {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (stripeKey && privateUser?.stripe_customer_id) {
        const response = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(privateUser.stripe_customer_id)}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (!response.ok && response.status !== 404) console.error('Stripe customer cleanup failed', response.status);
    }
    if (stripeKey && privateUser?.stripe_account_id) {
        const response = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(privateUser.stripe_account_id)}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (!response.ok && response.status !== 404) console.error('Stripe account cleanup deferred', response.status);
    }

    const revenueCatKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (revenueCatKey) {
        const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${revenueCatKey}` },
        });
        if (!response.ok && response.status !== 404) console.error('RevenueCat cleanup failed', response.status);
    }
}

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'content-type': 'application/json' },
    });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);
        const userId = user.id;

        const [{ data: privateUser }, { data: conversations }] = await Promise.all([
            admin.from('private_users').select('stripe_customer_id, stripe_account_id').eq('id', userId).maybeSingle(),
            admin.from('conversations').select('id').contains('participant_ids', [userId]),
        ]);

        const mediaTasks = [
            removeFolder('private-media', `faces/${userId}`),
            removeFolder('private-media', `generated/${userId}`),
            removeFolder('avatars', userId),
            removeFolder('posts', userId),
            removeFolder('products', `products/${userId}`),
        ];
        for (const conversation of conversations || []) {
            const prefix = `messages/${conversation.id}`;
            const { data: files } = await admin.storage.from('private-media').list(prefix, { limit: 1000 });
            const ownFiles = (files || [])
                .filter((entry: any) => entry.id && entry.name.startsWith(`${userId}_`))
                .map((entry: any) => `${prefix}/${entry.name}`);
            if (ownFiles.length) mediaTasks.push(admin.storage.from('private-media').remove(ownFiles));
        }
        const mediaResults = await Promise.allSettled(mediaTasks);
        mediaResults.forEach((result) => {
            if (result.status === 'rejected') console.error('media cleanup failed', result.reason?.message);
        });

        await deleteProcessorProfiles(userId, privateUser);

        const { error: dataError } = await admin.rpc('delete_account_data', { p_user_id: userId });
        if (dataError) {
            console.error('delete_account_data failed', dataError.message);
            return json({ error: 'Failed to delete account data' }, 500);
        }

        const { error: authError } = await admin.auth.admin.deleteUser(userId);
        if (authError) {
            console.error('auth user deletion failed', authError.message);
            return json({ error: 'App data was removed, but login deletion requires support' }, 500);
        }
        return json({ success: true });
    } catch (error: any) {
        console.error('delete-account failed', error?.message);
        return json({ error: 'Account deletion failed' }, 500);
    }
});
