// @ts-nocheck
// Public legal, support, and external account-deletion pages.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

const effectiveDate = 'August 17, 2026';
const supportEmail = 'support@emode.app';

const escapeHtml = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · emode</title>
<style>body{font:16px/1.6 system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:32px 20px;color:#18181b;background:#fff}h1{font-size:2rem}h2{margin-top:2rem;font-size:1.25rem}a{color:#5b21b6}nav{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:36px}label{display:block;font-weight:600;margin-top:16px}input,textarea{box-sizing:border-box;width:100%;padding:12px;margin-top:6px;border:1px solid #a1a1aa;border-radius:8px;font:inherit}button{margin-top:18px;padding:12px 18px;border:0;border-radius:8px;background:#18181b;color:#fff;font-weight:700}.muted{color:#52525b}.notice{padding:14px;border-radius:8px;background:#f4f4f5}</style></head>
<body><nav><a href="./privacy">Privacy</a><a href="./terms">Terms</a><a href="./support">Support</a><a href="./delete-account">Delete account</a></nav>${body}</body></html>`;

const privacy = page('Privacy Policy', `
<h1>emode Privacy Policy</h1><p class="muted">Effective ${effectiveDate}</p>
<p>This policy explains how emode collects, uses, shares, retains, and deletes information when you use our fashion social, marketplace, messaging, and AI virtual try-on services.</p>
<h2>Information we collect</h2>
<p>We collect account and profile information; posts, comments, messages, reports, wardrobe and product content; purchase, order, subscription, and seller-onboarding records; device push tokens and login-session details; support requests; and diagnostic events.</p>
<p>If you opt in to AI face processing, we process the face photo you select and clothing images to generate an outfit image. A face photo can be sensitive personal data. We do not use it to identify you, authenticate you, or train our own model.</p>
<h2>How information is used</h2>
<p>We use information to operate accounts and social features, generate requested AI images, fulfill marketplace orders, verify subscriptions, prevent fraud and abuse, enforce our rules, provide support, send notifications you enable, and diagnose reliability or security problems.</p>
<h2>Service providers and sharing</h2>
<p>We share only the information needed for a service with: Supabase for authentication, database, storage, and server functions; Google Gemini for requested AI generation and product-search prompts; RevenueCat and Apple or Google for subscriptions; Stripe for marketplace and styling-session payments and for seller and stylist onboarding; Expo for push delivery; and Sentry for diagnostics when enabled. Sellers receive the shipping and order details needed to fulfill purchases. A stylist you book receives the styling context you choose to share with them during your session, including a face photo if you send one. We may also disclose information when legally required or necessary to protect users and the service.</p>
<p>Your profile and content you intentionally publish are public, subject to blocking and moderation. Direct messages, stored face photos, and face-derived try-on outputs are access-controlled and are not public posts unless you separately choose to publish content.</p>
<h2>Choices and controls</h2>
<p>You can edit your profile, control notification categories, block users, report content, revoke AI face consent, remove your saved face photo and generated try-ons, or permanently delete your account in the app. You can also submit an external deletion request below. Device settings control camera, photo, and notification permissions.</p>
<h2>Retention and deletion</h2>
<p>Account content is retained while your account is active. In-app deletion removes the account and app content, including private face media and generated try-ons. We may retain limited transaction, fraud-prevention, tax, dispute, moderation, or legal records where required, then delete or de-identify them when no longer necessary. Processor systems may retain backups for a limited period under their own retention controls.</p>
<h2>Security, children, and changes</h2>
<p>We use access controls, private storage, encrypted transport, server-side payment and entitlement verification, and monitoring. No system is perfectly secure. emode is not directed to children under 13; users must be old enough to consent under applicable law. We will post material policy changes here and update the effective date.</p>
<h2>Contact</h2><p>Use in-app Support, email <a href="mailto:${supportEmail}">${supportEmail}</a>, or use the <a href="./delete-account">external deletion request</a>.</p>`);

const terms = page('Terms of Use', `
<h1>emode Terms of Use</h1><p class="muted">Effective ${effectiveDate}</p>
<p>By creating an account or using emode, you agree to these Terms and the Privacy Policy. You must be legally able to agree and provide accurate account and transaction information.</p>
<h2>Community safety and user content</h2>
<p>emode has zero tolerance for objectionable content and abusive users. Do not post, message, sell, or generate content involving child sexual exploitation, credible threats, targeted harassment, hate-based abuse, non-consensual sexual content, fraud, illegal goods, impersonation, or infringement. You retain ownership of your content and grant emode a limited license to host, display, process, and moderate it to operate the service.</p>
<p>Users can report content and block other users. We may filter, remove, restrict, preserve as evidence, or report content; suspend or terminate accounts; cancel listings; and cooperate with lawful requests. Repeated or severe violations may result in immediate termination.</p>
<h2>AI features</h2>
<p>AI results can be inaccurate, inappropriate, or unrealistic and are for creative visualization, not a guarantee of product fit or appearance. You must have permission to upload each image. Face processing requires separate consent, which you can revoke. Do not use AI features to create deceptive, exploitative, or unlawful content.</p>
<h2>Subscriptions</h2>
<p>Digital subscriptions are purchased through Apple or Google and renew unless canceled in your store settings. Prices and billing periods shown by the store control. Restore Purchases can recover eligible access. Refunds are handled under the applicable store's rules.</p>
<h2>Styling sessions</h2>
<p>A styling session is a live, one-to-one service between you and a verified stylist, booked at the price that stylist sets and held open for the length you choose. Your card is authorized when you book and is only charged once your stylist delivers a look inside that window. If the window closes without a delivery, or if either of you cancels first, the authorization is released and you are not charged. emode keeps a platform fee from each completed session and pays the remainder to the stylist through Stripe.</p>
<p>Stylists are independent of emode and are responsible for the advice they give, their own taxes, and their own conduct. emode does not employ stylists, does not guarantee any particular result, and is not a party to the advice given in a session. Sessions are subject to the same community rules as the rest of the service, and a session can be cancelled or an account restricted for abuse. If a stylist processes your face photo during a session, that requires your separate AI face consent, which you can revoke at any time.</p>

<h2>Marketplace</h2>
<p>Marketplace payments are for physical goods. Sellers are responsible for accurate listings, lawful goods, fulfillment, shipping, returns, and applicable taxes. Buyers are responsible for accurate shipping information. Stripe processes payments and seller verification. We may hold, refund, reverse, or cancel transactions to address disputes, fraud, unavailable inventory, or legal requirements.</p>
<h2>Disclaimers and limits</h2>
<p>The service is provided “as is” to the extent permitted by law. We do not guarantee uninterrupted operation, AI results, listings, sellers, or third-party services. Nothing here limits rights that cannot legally be limited.</p>
<h2>Termination and contact</h2>
<p>You may stop using the service or delete your account at any time. We may restrict access for safety, legal, payment, or Terms violations. Questions can be sent through in-app Support or to <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`);

const support = (sent = false) => page('Support', `
<h1>emode Support</h1>${sent ? '<p class="notice">Your request was received. We will reply to the email associated with your account.</p>' : ''}
<p>For account access, safety reports, purchases, subscriptions, privacy, or technical issues, use the Support form inside the signed-in app. This lets us associate the request securely with your account.</p>
<p>If you cannot sign in, email <a href="mailto:${supportEmail}">${supportEmail}</a>. To remove an account without app access, use the <a href="./delete-account">account deletion request</a>.</p>`);

const deletionForm = (submitted = false) => page('Delete Account', `
<h1>Delete your emode account</h1>
${submitted ? '<p class="notice">If an account matches that address, the deletion request is queued. We may email you to verify ownership before deletion.</p>' : `
<p>The fastest option is in the app: Settings → Account → Delete Account. In-app deletion removes your login, profile, posts, messages, saved face media, generated try-ons, and other app content.</p>
<p>If you cannot access the app, submit this form. We will verify account ownership. Limited transaction, fraud, dispute, tax, moderation, or legal records may be retained where required, as described in the Privacy Policy.</p>
<form method="post">
<label for="email">Account email</label><input id="email" name="email" type="email" autocomplete="email" maxlength="320" required>
<label for="note">Optional details</label><textarea id="note" name="note" rows="5" maxlength="2000"></textarea>
<input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<button type="submit">Request account deletion</button>
</form>`}`);

serve(async (req: Request) => {
    const url = new URL(req.url);
    const route = url.pathname.split('/').filter(Boolean).pop() || 'privacy';
    const headers = {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=300',
    };

    if (req.method === 'GET') {
        if (route === 'terms') return new Response(terms, { headers });
        if (route === 'support') return new Response(support(url.searchParams.get('sent') === '1'), { headers });
        if (route === 'delete-account') return new Response(deletionForm(url.searchParams.get('submitted') === '1'), { headers });
        return new Response(privacy, { headers });
    }

    if (req.method === 'POST' && route === 'delete-account') {
        const type = req.headers.get('content-type') || '';
        const input = type.includes('application/json')
            ? await req.json()
            : Object.fromEntries((await req.formData()).entries());
        const email = String(input.email || '').trim().toLowerCase();
        const note = String(input.note || '').trim();
        const honeypot = String(input.website || '');

        if (!honeypot && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 && note.length <= 2000) {
            const { error } = await supabase.from('account_deletion_requests').insert({ email, note: note || null });
            if (error && error.code !== '23505') console.error('deletion request insert failed', error.code);
        }
        return Response.redirect(`${url.origin}${url.pathname}?submitted=1`, 303);
    }

    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
});
