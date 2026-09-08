// @ts-nocheck
// The Stripe publishable key, served rather than compiled in.
//
// It used to arrive only through EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY, baked into
// the binary at build time, which made "switch Stripe to live" a native build
// -- and an irreversible one, since going back would be another build. Served
// from here, test and live become a secret change: instant, and undoable in the
// ten seconds it takes to set it back.
//
// Unauthenticated on purpose. This key is publishable by definition: it ships
// inside every copy of the app, appears in the page source of every Stripe
// checkout on the web, and can do nothing but tokenise a card against the
// account it belongs to. Requiring a JWT would buy no secrecy for something
// already public, and would leave StripeProvider -- which mounts above the auth
// gate -- unable to configure itself until somebody signed in.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve((req: Request) => {
    const cors = corsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: cors });
    }

    // Empty rather than an error when unset: the client keeps its compiled-in
    // fallback, which is the correct behaviour for a project that has not
    // configured this yet.
    const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '';

    return new Response(
        JSON.stringify({ publishableKey }),
        {
            headers: {
                ...cors,
                'content-type': 'application/json',
                // Short, so flipping the secret reaches clients quickly, but
                // not zero -- this is called on every cold start.
                'cache-control': 'public, max-age=60',
            },
        },
    );
});
