# Turning on Apple and Google sign-in

The app code is done. What is left is credentials, and none of it can be created
from here — it lives in the Apple Developer portal, Google Cloud, and the
Supabase dashboard.

Until each provider is configured, its button does not appear at all. That is
deliberate: a sign-in button that fails at the tap is worse than one that is
absent, and it means you can turn these on one at a time.

## Order matters

Apple **requires** Sign in with Apple wherever another third-party login is
offered (Guideline 4.8). So Google alone is a rejection. Apple alone is fine.

---

## 1. Sign in with Apple

### Apple Developer portal
1. **Certificates, Identifiers & Profiles → Identifiers →** your App ID
   (`com.emode.app`) → tick **Sign In with Apple** → Save.
2. **Identifiers → +** → **Services IDs**. Description "emode web auth",
   identifier something like `com.emode.app.web`. This is what Supabase
   identifies itself as.
3. Configure that Services ID:
   - Primary App ID: `com.emode.app`
   - Domains: `scvvbjheyfnxlsiiozta.supabase.co`
   - Return URL: `https://scvvbjheyfnxlsiiozta.supabase.co/auth/v1/callback`
4. **Keys → +** → tick **Sign in with Apple** → configure to the App ID →
   Register → **download the .p8**. It is downloadable exactly once.
   Note the **Key ID**, and your **Team ID** from the top right of the portal.

### Supabase dashboard
**Authentication → Providers → Apple**, enable, then:
- Client IDs: `com.emode.app` *and* the Services ID, comma separated. The first
  is what the native sheet returns a token for; leaving it out makes the app's
  own sign-ins fail while the web one works.
- Secret Key: the contents of the .p8
- Key ID, Team ID: from above

Nothing goes in the app for Apple. `ios.usesAppleSignIn` is already set, so the
entitlement is in the next build.

---

## 2. Google

### Google Cloud Console
Create **two** OAuth client IDs under the same project
(APIs & Services → Credentials):

1. **iOS** — bundle ID `com.emode.app`. This identifies the app to Google.
2. **Web application** — Authorised redirect URI
   `https://scvvbjheyfnxlsiiozta.supabase.co/auth/v1/callback`. This is the
   audience Supabase checks the token against.

Both are needed and they do different jobs. With only the iOS one, sign-in
succeeds at Google and is then rejected by Supabase.

### Supabase dashboard
**Authentication → Providers → Google**, enable, then paste the **Web** client
ID and secret. Add the **iOS** client ID to "Authorized Client IDs".

### This repo
Add to `.env.local`, and to the EAS `production` environment for release builds:

    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<the iOS client id>
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<the web client id>

`app.config.js` adds the native plugin only when the iOS id is present, and
derives the URL scheme by reversing it. Set them before building or the button
stays hidden.

---

## Why Google is native rather than a browser

Supabase can run the Google flow itself, which needs no client id in the app at
all. It also puts `scvvbjheyfnxlsiiozta.supabase.co` in the address bar, and
Google's consent screen then reads "to continue to
scvvbjheyfnxlsiiozta.supabase.co". Nobody signing into emode should be shown the
name of its database. The native sheet shows no URL.

---

## Checking it worked

A new build is required — both are native modules and will not appear over the
air.

1. Both buttons show under "or" on the sign-in screen.
2. Signing in with a fresh Apple ID lands in the app with a real profile:
   `handle_new_user` builds a username and handle from the email or the id, so
   there is no half-made account.
3. `private_users.terms_accepted_at` is filled. Password sign-up sends that
   through metadata; a social sign-in has no metadata of ours, so the app writes
   it after the fact.
4. Apple returns a person's name **once**, on the first authorisation ever. To
   test that path again, remove the app from
   **Settings → Apple ID → Sign in with Apple**, or it returns null forever.
