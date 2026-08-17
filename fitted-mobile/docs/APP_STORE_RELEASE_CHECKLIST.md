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
      No production build has ever run; the only two EAS builds are iOS `development`.
- [x] Create subscription products in App Store Connect. App `6778471515`, three groups:
      Stylist `22145409` / Business `22145464` / Try-Ons `22145498`, each with one
      1-month subscription, full 175-region pricing, English (U.S.) localization on both
      the subscription and the group.
- [x] Attach products and entitlements in RevenueCat. Project `e64ed501`, offering
      `default` (`ofrng74e97dcf85`) with packages `stylist_monthly`, `business_monthly`,
      `pro_tryons_monthly`.
- [ ] Submit the subscriptions. All three sit at "Prepare for Submission" and Apple
      requires the first subscription group to ship with a new app version. RevenueCat
      still reports "Missing Metadata" for all three; the likely cause is that Apple
      serves no product metadata until that first submission, so re-check after the
      first build rather than treating it as a config error.
- [ ] Verify purchase, restore, cancellation, expiry, and reinstall flows with a StoreKit sandbox account.
- [ ] Provide EU trader status (Digital Services Act). Until set, new apps and updates
      cannot be submitted for EU distribution. Requires an Admin or Account Holder.
- [ ] Answer Apple's new social-media questions in the age-rating section of App Information.
- [ ] Upload a review screenshot for each of the three subscriptions.
- [ ] Create a populated App Review account and enter its credentials in App Review Information.
- [ ] Complete App Privacy answers from the actual production data flows; the code-level manifest does not replace App Store Connect privacy labels.
- [ ] Complete age rating, content-rights, encryption/export, and user-generated-content questionnaires.
- [ ] Upload final iPhone screenshots, description, keywords, support URL, and privacy-policy URL.
- [ ] Provision the Apple Pay merchant identifier if Apple Pay will be offered at launch.
- [ ] Add a moderation alert destination and assign a human response owner using `docs/MODERATION_RUNBOOK.md`.
- [x] Populate the production EAS environment. `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`,
      `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_LOGODEV_TOKEN`, and
      `EXPO_PUBLIC_PLATFORM_FEE_PERCENT` are set on `@bmtall/emode`.
- [ ] Add `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the production EAS environment using a
      **live** key. It was deliberately left unset — the only key on hand is `pk_test_`,
      and a test key in production fails silently at checkout.
- [ ] Add the Sentry source-map token (`SENTRY_AUTH_TOKEN`) to the production EAS environment
      and verify one nonfatal test event.
- [ ] Confirm marketplace tax, shipping, refund/return, and seller-support operations for each launch region.
- [ ] Run one end-to-end purchase and refund in Stripe test mode, including seller onboarding and webhook delivery.

## Google Play follow-up

- [ ] Complete Data safety, content rating, ads, target-audience, and account-deletion declarations.
- [ ] Add an Android app to the RevenueCat project. Only the App Store app exists today, so
      `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` cannot be set yet and Android purchases
      are non-functional.
- [ ] Configure the Android RevenueCat SDK key and matching Play Billing products.
- [ ] Verify a signed Android App Bundle on an internal testing track.
