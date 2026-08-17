// @ts-nocheck
// supabase/functions/product-search/index.ts
// Authenticated proxy for the RapidAPI KicksDB product search so the RapidAPI
// key never ships in the app bundle. Requires a valid JWT.
//   { query: string, limit?: number }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts';

const RAPIDAPI_HOST = 'kicks-db.p.rapidapi.com';
const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY') || '';

// RapidAPI/KicksDB is metered per call — cap to protect the quota and bill.
const RATE_LIMIT = { max: 60, windowSeconds: 60 }; // 60 searches / minute / user

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        const rl = await checkRateLimit(user.id, 'product-search', RATE_LIMIT.max, RATE_LIMIT.windowSeconds);
        if (!rl.allowed) return rateLimitResponse(rl, cors);

        if (!RAPIDAPI_KEY) return json({ error: 'Product search not configured' }, 500);

        const { query, limit = 20 } = await req.json();
        const q = String(query || '').trim();
        if (!q) return json({ raw: null });

        const headers = { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST };

        let resp = await fetch(
            `https://${RAPIDAPI_HOST}/search/multi?keyword=${encodeURIComponent(q)}&limit=${limit}`,
            { method: 'GET', headers }
        );

        if (!resp.ok) {
            resp = await fetch(
                `https://${RAPIDAPI_HOST}/stockx/search?query=${encodeURIComponent(q)}&count=${limit}`,
                { method: 'GET', headers }
            );
        }

        if (!resp.ok) return json({ error: `Upstream error: ${resp.status}` }, 502);

        const data = await resp.json();
        // Return the raw upstream payload; the client maps it to its Product shape.
        return json({ raw: data });
    } catch (error: any) {
        console.error('product-search error:', error);
        return json({ error: error.message }, 500);
    }
});
