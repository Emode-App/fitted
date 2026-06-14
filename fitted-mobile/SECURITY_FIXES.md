# Security Fixes — deployment & verification

This change set closes the Critical/High findings from the audit. Most of the
protection lives in the **database** and **edge functions**, so the code changes
alone do nothing until you run the migration, set the secrets, and deploy the
functions. Do the steps in order.

> The app will partly break until steps 1–3 are done (the client now reads
> `private_users`, calls `sync-entitlement`, and proxies AI through edge
> functions). That's expected. Finish the rollout before testing.

---

## 0. Rotate the exposed secrets (do this first)

These were committed to git history and/or shipped in the app bundle. Treat them
as compromised and rotate at the provider before anything else:

- **Google Gemini** key `AIzaSy…MQhM` → regenerate in Google AI Studio.
- **RapidAPI (KicksDB)** key `211ebb…4440` → regenerate in the RapidAPI dashboard.
- **Stripe secret** `sk_test_…` (was in `.env.local`) → roll in the Stripe dashboard.
- **RevenueCat**: you need the **secret** API key (v1) for server verification —
  that is *not* the public SDK key the app uses.

## 1. Run the database migration

Supabase SQL Editor → run the whole file:

```
supabase/security_hardening.sql
```

It is idempotent. It moves `email` + Stripe ids into a private `private_users`
table, locks the entitlement flags against client writes, restricts message
edits, creates the `private-media` bucket + storage policies, and relaxes the
`subscription_status` check to allow `pro_tryons`.

## 2. Set edge-function secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_or_test_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxx \
  STRIPE_PUBLISHABLE_KEY=pk_xxx \
  PLATFORM_FEE_PERCENT=15 \
  GEMINI_API_KEY=xxx \
  RAPIDAPI_KEY=xxx \
  REVENUECAT_SECRET_KEY=sk_revenuecat_secret_xxx \
  ALLOWED_ORIGINS=https://yourapp.example.com
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided
to functions automatically.

## 3. Deploy the edge functions

`supabase/config.toml` already sets `verify_jwt=false` only for `stripe-webhook`.

```bash
supabase functions deploy create-connect-account
supabase functions deploy create-connect-link
supabase functions deploy create-payment-intent
supabase functions deploy stripe-webhook
supabase functions deploy sync-entitlement
supabase functions deploy ai-proxy
supabase functions deploy product-search
```

## 4. RevenueCat → entitlement truth

The client can no longer set `is_verified_stylist` / `is_business_account`
itself. `sync-entitlement` verifies with RevenueCat using `REVENUECAT_SECRET_KEY`
and is the only writer. The app calls `Purchases.logIn(user.id)`, so the
RevenueCat `app_user_id` already matches the Supabase user id the function looks
up. (Optional but recommended: also add a RevenueCat webhook that calls
`sync-entitlement` so server-side renewals/cancellations stay in sync.)

## 5. Storage buckets

`private-media` is created by the migration as **private**. Leave the existing
`posts` / `avatars` / `products` buckets as-is (public feed content). DM photos
and face photos now go to `private-media` and are served via signed URLs.

---

## What changed in code (for review)

| Area | Before | After |
|------|--------|-------|
| Entitlements | client wrote `is_verified_stylist=true` directly | DB trigger blocks client escalation; `sync-entitlement` verifies via RevenueCat |
| `users` table | anon could read every email + Stripe id | moved to `private_users` (owner-only read) |
| Connect account | `user_id`+`email` from request body | derived from JWT |
| Payment intent | client sent amount, fee %, stylist account, email | JWT identity; fee + stylist account + customer derived server-side; amount bounded |
| Connect link | any account id from body | caller's own account only |
| Messages | any participant could edit any message | trigger limits client edits to `is_read` + `payment_request` |
| DM/face media | public `posts` bucket, public URLs | private `private-media` bucket, signed URLs, RLS by membership/owner |
| Gemini / RapidAPI keys | inlined in the app bundle | server-only via `ai-proxy` / `product-search` |
| Signup | wrote `email` into public `users` | email stays in `auth.users` / `private_users` |
| Password | only non-empty | ≥ 8 chars on signup |

## Known residual items (documented, not blocking)

- **Try-on daily limit** is still enforced client-side. The key leak (the real
  cost risk) is fixed; add a server-side counter in `ai-proxy` later if you want
  the limit to be tamper-proof.
- **`styling_sessions`** rows remain participant-writable for the in-app
  *simulated* accept flow. Real-money completion is authoritative only via the
  Stripe webhook — don't treat a client-written `completed` row as proof of
  payment.
- **Generated outfit images** (the composited try-on, which contains a face) are
  still uploaded to public buckets because they're shareable feed/delivery
  content. Only the raw face photo is private.
