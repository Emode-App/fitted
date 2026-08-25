// Stripe will not send anyone back to emode://.
//
// accountLinks.create rejects a custom scheme outright -- the logs read
// "create-connect-link failed StripeInvalidRequestError" -- because it requires
// an http or https address it can hand to a browser. The app has no web domain,
// so this function is the address: Stripe returns the browser here, and here we
// hand it on to the app.
//
// The destination is chosen from a fixed pair, never from the query string
// itself. Reflecting a caller-supplied URL would turn a public endpoint into an
// open redirect that any phishing link could borrow our domain for.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const DESTINATIONS: Record<string, string> = {
    return: 'emode://stripe-return',
    refresh: 'emode://stripe-refresh',
};

serve((req: Request) => {
    const wanted = new URL(req.url).searchParams.get('to') ?? 'return';
    const target = DESTINATIONS[wanted] ?? DESTINATIONS.return;

    // A redirect, not a page.
    //
    // The first version served HTML that navigated itself, which arrived as a
    // screenful of raw markup: the platform gateway rewrites the content type
    // to text/plain and sends X-Content-Type-Options: nosniff with it, so the
    // browser is instructed not to treat it as HTML no matter what it looks
    // like. Nothing the function sets survives that.
    //
    // A 302 needs no content type. The app opens onboarding with
    // Linking.openURL, so this lands in Safari rather than an embedded
    // webview, and Safari follows a redirect into a custom scheme.
    return new Response(null, {
        status: 302,
        headers: { location: target, 'cache-control': 'no-store' },
    });
});
