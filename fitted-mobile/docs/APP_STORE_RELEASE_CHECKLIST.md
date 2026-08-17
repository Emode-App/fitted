# App store release checklist

## Code and backend complete

- [x] Expo SDK dependencies aligned; Expo Doctor passes.
- [x] iOS bundle ID and Android package are `com.emode.app`.
- [x] Release versioning is remote with automatic production build-number increments.
- [x] iOS privacy manifest aggregates every required-reason API declared by native dependencies.
- [x] Arbitrary iOS network loads are disabled.
- [x] Android media, storage, and microphone permissions not used by the app are blocked.
- [x] Auth deep links, password reset, account deletion, support, legal pages, AI consent/revocation, and subscription management are implemented.
- [x] User-generated content supports reporting and blocking for posts, comments, messages, products, AI output, and users.
- [x] Supabase Row Level Security, explicit grants, service-only policies, advisor findings, foreign-key indexes, and auth-policy performance findings are addressed.
- [x] Stripe physical-goods checkout is server-authoritative, inventory-aware, idempotent, and uses verified webhooks.
- [x] Paid digital styling payments are disabled; subscriptions use native in-app purchase infrastructure.

## Required before submission

- [ ] Build and test a production-signed iOS archive on physical devices through TestFlight.
- [ ] Create, submit, and attach all subscription products in App Store Connect and RevenueCat.
- [ ] Verify purchase, restore, cancellation, expiry, and reinstall flows with a StoreKit sandbox account.
- [ ] Create a populated App Review account and enter its credentials in App Review Information.
- [ ] Complete App Privacy answers from the actual production data flows; the code-level manifest does not replace App Store Connect privacy labels.
- [ ] Complete age rating, content-rights, encryption/export, and user-generated-content questionnaires.
- [ ] Upload final iPhone screenshots, description, keywords, support URL, and privacy-policy URL.
- [ ] Provision the Apple Pay merchant identifier if Apple Pay will be offered at launch.
- [ ] Add a moderation alert destination and assign a human response owner using `docs/MODERATION_RUNBOOK.md`.
- [ ] Add the Sentry source-map token to the production EAS environment and verify one nonfatal test event.
- [ ] Confirm marketplace tax, shipping, refund/return, and seller-support operations for each launch region.
- [ ] Run one end-to-end purchase and refund in Stripe test mode, including seller onboarding and webhook delivery.

## Google Play follow-up

- [ ] Complete Data safety, content rating, ads, target-audience, and account-deletion declarations.
- [ ] Configure the Android RevenueCat SDK key and matching Play Billing products.
- [ ] Verify a signed Android App Bundle on an internal testing track.
