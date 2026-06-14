// @ts-nocheck
// Shared JWT verification for edge functions.
// Returns the authenticated Supabase user, or an error string. Every function
// that mutates data or talks to Stripe MUST call this and derive identity from
// the returned user — never from request-body fields.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

export async function getUser(req: Request): Promise<{ user: any | null; error: string | null }> {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return { user: null, error: 'Missing Authorization header' };

    const client = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
    );

    const { data, error } = await client.auth.getUser(jwt);
    if (error || !data?.user) return { user: null, error: 'Invalid or expired token' };
    return { user: data.user, error: null };
}
