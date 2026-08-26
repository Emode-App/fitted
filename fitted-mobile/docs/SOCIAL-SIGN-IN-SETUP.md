# Turning on Apple and Google sign-in

The app code is done, and so is everything that could be done from a machine.
What is left is three fields in the Supabase dashboard and one capability in the
Apple Developer portal.

Until each provider is configured, its button does not appear at all. That is
deliberate: a sign-in button that fails at the tap is worse than one that is
absent, and it means these can be turned on one at a time.

Apple **requires** Sign in with Apple wherever another third-party login is
offered (Guideline 4.8). So Google alone is a rejection. Apple alone is fine.

---

## Already done

Google Cloud project **Emode** (`gen-lang-client-0249147471`):

- OAuth consent screen: app name `emode`, External, support and developer
  contact `brandonmtalla@gmail.com`, home page / privacy / terms pointed at
  emode.style, `emode.style` added to Authorized domains. No warnings left.
- **Web client** — "emode - Supabase auth (web)", redirect
  `https://scvvbjheyfnxlsiiozta.supabase.co/auth/v1/callback`
  `19094142874-9fd03alukh8pq6msiom93ape4krlmnv6.apps.googleusercontent.com`
- **iOS client** — "emode iOS", bundle `com.emode.app`
  `19094142874-2o2e3ed46nc8fc73bkllof7jk6eiulr0.apps.googleusercontent.com`
- `brandonmtalla@gmail.com` added as a test user (see Publishing status below).

Supabase (`scvvbjheyfnxlsiiozta`):

- **Apple provider enabled**, Client IDs `com.emode.app`, no secret.
- Google provider still disabled -- it is the only thing that needs a secret,
  and the secret is yours to paste.

This repo:

- Both ids in `.env.local` (gitignored) and in the EAS `production`, `preview`
  and `development` environments, so any profile builds with the button visible.
- `app.config.js` derives the URL scheme by reversing the iOS id. Confirmed
  emitting `com.googleusercontent.apps.19094142874-2o2e3ed46nc8fc73bkllof7jk6eiulr0`.

---

## 1. Sign in with Apple

One step left, in the Apple portal. The Supabase side is already done.

Because the app signs in **natively** -- `expo-apple-authentication` hands back
an identity token that Supabase verifies against Apple's public keys -- there is
no Services ID, no `.p8` signing key, no Key ID and no Team ID to produce. Those
belong to the web OAuth flow, which this app does not use. Supabase's own words:
"If you're building a native app only, you do not need to configure the OAuth
settings."

This also means there is no secret to rotate every six months.

### Apple Developer portal
**Certificates, Identifiers & Profiles → Identifiers →** the `com.emode.app`
App ID → tick **Sign In with Apple** in the Capabilities list → Save. Leave the
server-to-server notification endpoint blank; Supabase does not support it.

(EAS may have already enabled this while setting up credentials, since
`ios.usesAppleSignIn` is set in app.json. Check before assuming it is missing.)

### Supabase dashboard -- done
**Authentication → Providers → Apple** is enabled with `com.emode.app` in
**Client IDs** and both secret fields empty, which the dashboard accepted
without complaint -- the practical proof that the native path needs no key.

Add `host.exp.Exponent` to that same comma-separated list *only* if you want
Apple sign-in to work inside Expo Go -- that is the App ID Expo Go signs as.
Not needed for TestFlight or a dev build, which both use `com.emode.app`.

---

## 2. Google

Google Cloud is finished. What remains is one screen.

**Authentication → Providers → Google**, enable, then:

- **Client IDs** -- both ids, comma separated, **web first**:

      19094142874-9fd03alukh8pq6msiom93ape4krlmnv6.apps.googleusercontent.com,19094142874-2o2e3ed46nc8fc73bkllof7jk6eiulr0.apps.googleusercontent.com

  The web id is the audience Supabase checks the token against; the iOS id is
  what the app identifies itself as. With only one of them, sign-in succeeds at
  Google and is then rejected here.

- **Client Secret** -- the secret from the web client. It is only used by the
  browser OAuth flow, which this app does not use, but the dashboard wants it.

- **Skip nonce check** -- **turn this on.** This is the one that is easy to miss
  and hard to diagnose. `@react-native-google-signin` does not put a nonce in
  the token it returns, so with the check left on, every Google sign-in fails
  verification with an error that says nothing about nonces.

### Publishing status

The consent screen is in **Testing**, which means only the listed test users can
sign in -- everyone else is turned away by Google before the app is ever
involved. Fine for TestFlight with a short list. **Not fine for App Review or
release:** a reviewer tapping the Google button would be refused.

Publish it from **Google Auth Platform → Audience → Publish app**. Because the
app asks only for email, profile and openid -- no sensitive or restricted
scopes -- publishing does not trigger a verification review. It takes effect
immediately.

While still in Testing, each tester's Google address has to be added under
**Audience → Test users**.

---

## Why Google is native rather than a browser

Supabase can run the Google flow itself, which needs no client id in the app at
all. It also puts `scvvbjheyfnxlsiiozta.supabase.co` in the address bar, and
Google's consent screen then reads "to continue to
scvvbjheyfnxlsiiozta.supabase.co". Nobody signing into emode should be shown the
name of its database. The native sheet shows no URL.

---

## Checking it worked

A new build is required -- both are native modules and will not appear over the
air.

1. Both buttons show under "or" on the sign-in screen. If one is missing, its
   configuration is missing, not broken.
2. Signing in with a fresh Apple ID lands in the app with a real profile:
   `handle_new_user` builds a username and handle from the email or the id, so
   there is no half-made account.
3. `private_users.terms_accepted_at` is filled. Password sign-up sends that
   through metadata; a social sign-in has no metadata of ours, so the app writes
   it after the fact.
4. Apple returns a person's name **once**, on the first authorisation ever. To
   test that path again, remove the app from
   **Settings → Apple ID → Sign in with Apple**, or it returns null forever.
