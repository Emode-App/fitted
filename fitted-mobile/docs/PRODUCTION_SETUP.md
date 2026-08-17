# Production setup

Status for Supabase project `scvvbjheyfnxlsiiozta` as of August 12, 2026.

## Live backend controls

- AI generation and catalog search require an authenticated Supabase user.
- AI generation is limited to 30 requests per hour, plus 15 successful generations per UTC day for free users or 100 for Pro users.
- Catalog search is limited to 60 requests per minute.
- Rate-limit infrastructure fails closed with a temporary 503 so an outage cannot bypass metered-provider cost controls.
- AI face-photo processing requires explicit consent. Revoking consent deletes retained faces, AI outputs, and related sharing records.
- Stripe webhook events are signature-verified and idempotent.
- Marketplace totals, inventory reservation, destination account, and platform fees are calculated server-side.
- Account deletion removes authentication, application records, stored media, device tokens, and processor identifiers.
- Database Security Advisor reports no findings. Unused-index notices are expected while the production database is empty.

## External configuration still required

### RevenueCat and app-store subscriptions

Create and approve these product identifiers in App Store Connect and Google Play, then attach them to the matching RevenueCat entitlements:

| Product | Entitlement |
|---|---|
| `emode_stylist_monthly` | `verified_stylist` |
| `emode_business_monthly` | `business_account` |
| `emode_pro_tryons_monthly` | `pro_tryons` |

Prefer platform-specific EAS environment variables:

- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`

`EXPO_PUBLIC_REVENUECAT_API_KEY` remains a compatibility fallback. Verify purchase, restore, expiry, cancellation, and reinstall behavior with StoreKit and Play billing test accounts.

### Sentry source maps

The DSN and native plugin are wired. Add `SENTRY_AUTH_TOKEN` as a secret in the production EAS environment so release source maps upload and crash traces are readable. Do not commit the token.

### App Review account

Apple needs working credentials for any app with authenticated features. A helper is included:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
node scripts/create-demo-user.mjs
```

The script defaults to `appreview@fitted.app`; override `DEMO_EMAIL` and `DEMO_PASSWORD` if needed. Put the resulting credentials and feature notes in App Store Connect. Never commit the service-role key or demo password.

### Marketplace operations

Before enabling physical-product sales for the public, confirm seller onboarding, returns/refunds, shipping support, prohibited-item enforcement, tax registrations, and whether Stripe Tax is required in each launch market. Also provision `merchant.com.emode.app` in Apple Developer before enabling Apple Pay in production.
