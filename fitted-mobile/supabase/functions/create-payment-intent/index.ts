import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    return new Response(JSON.stringify({
        error: 'paid_styling_unavailable',
        message: 'Paid styling requests are not available in this release.',
    }), {
        status: 410,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });
});
