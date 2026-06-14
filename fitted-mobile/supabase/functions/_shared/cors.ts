// @ts-nocheck
// Shared CORS handling for edge functions.
// Set ALLOWED_ORIGINS (comma-separated) as a function secret to lock the web
// origin(s) down. Native app requests carry no Origin header and are unaffected.
// The real authorization boundary is the JWT check in auth.ts, not CORS.

export function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('Origin') || '';
    const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    let allowOrigin = '*';
    if (allowed.length > 0) {
        allowOrigin = allowed.includes(origin) ? origin : allowed[0];
    }

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin',
    };
}
