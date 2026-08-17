// @ts-nocheck
// Revokes AI face processing consent and removes private face-derived media.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

async function removeFolder(prefix: string) {
    const { data, error } = await admin.storage.from('private-media').list(prefix, { limit: 1000 });
    if (error) throw error;
    const paths = (data || []).filter((entry: any) => entry.id).map((entry: any) => `${prefix}/${entry.name}`);
    if (paths.length) {
        const { error: removeError } = await admin.storage.from('private-media').remove(paths);
        if (removeError) throw removeError;
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

        await Promise.all([
            removeFolder(`faces/${user.id}`),
            removeFolder(`generated/${user.id}`),
        ]);

        const { data: sharedRows } = await admin
            .from('messages')
            .select('id, shared_face_url')
            .eq('sender_id', user.id)
            .not('shared_face_url', 'is', null);
        const sharedPaths = (sharedRows || [])
            .map((row: any) => row.shared_face_url)
            .filter((value: any) => typeof value === 'string' && value.startsWith('messages/'));
        if (sharedPaths.length) await admin.storage.from('private-media').remove(sharedPaths);

        const results = await Promise.all([
            admin.from('users').update({ ai_face_url: null }).eq('id', user.id),
            admin.from('user_settings').update({
                ai_face_consent_at: null,
                ai_face_consent_version: null,
                updated_at: new Date().toISOString(),
            }).eq('user_id', user.id),
            admin.from('dressing_room_outfits').delete().eq('user_id', user.id),
            admin.from('messages').update({ shared_face_url: null }).eq('sender_id', user.id).not('shared_face_url', 'is', null),
        ]);
        const failure = results.find((result: any) => result.error)?.error;
        if (failure) throw failure;

        return json({ success: true });
    } catch (error: any) {
        console.error('revoke-ai-consent failed', error?.message);
        return json({ error: 'Could not remove AI face data' }, 500);
    }
});
