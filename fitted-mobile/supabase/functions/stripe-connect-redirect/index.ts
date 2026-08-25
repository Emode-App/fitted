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

    // A 302 straight to a custom scheme is silently dropped by some in-app
    // browsers, which leaves somebody staring at a blank page wondering whether
    // their bank details went through. A real page that navigates itself, and
    // still offers a button when it cannot, always says something.
    const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Returning to emode</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#F5F2EC;color:#09090b;font:16px/1.5 -apple-system,system-ui,sans-serif;text-align:center}
  .card{padding:32px}
  a{display:inline-block;margin-top:20px;padding:14px 28px;border-radius:14px;
    background:#18181b;color:#fff;text-decoration:none;font-weight:600}
</style></head>
<body><div class="card">
  <p>Taking you back to emode&hellip;</p>
  <a href="${target}">Open emode</a>
</div>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`;

    return new Response(page, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
});
