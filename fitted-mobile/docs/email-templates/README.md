# Auth email templates

Branded replacements for Supabase's default auth emails. Paste each file into
**Supabase → Authentication → Emails → Templates** for the matching template and
set the subject line noted at the top of the file.

| File | Template | Subject |
| --- | --- | --- |
| `confirm-signup.html` | Confirm signup | Confirm your Emode account |
| `reset-password.html` | Reset password | Reset your Emode password |
| `change-email.html` | Change email address | Confirm your new Emode email |

Magic Link, Invite and Reauthentication are left at their defaults — the app
uses email + password and never triggers them. Style them if that changes.

## Why they look like this

Table layout with inline styles throughout. Outlook renders mail through Word's
HTML engine, which ignores flexbox, grid and most `<style>` blocks, so structure
has to live in table attributes and appearance has to be inline. The palette
(`#F5F2EC` ground, black wordmark) matches the app's `emode` theme in
`components/CustomSplashScreen.tsx`.

## The sender still says Supabase

These change what the email *looks like*, not who it comes from. Custom SMTP is
currently disabled on the project, so mail is sent by Supabase's shared service.
Supabase's own documentation is explicit about this:

> Before going into production, you must configure your own email provider.
> [The built-in service is] not meant for production use.

It is rate limited and shared, so past a trickle of signups confirmation emails
stop arriving. **This is a launch blocker, not a cosmetic one.** Configure a
provider (Resend and Postmark are both fine) with a verified sender on
`emode.style`, then enable it under Authentication → Emails → SMTP Settings.
After that the default is 30 new users/hour, adjustable under Authentication →
Rate Limits.

## Known gap: these links only work on the phone

`stores/authStore.ts` passes `emailRedirectTo: 'emode://auth'`. `ConfirmationURL`
resolves to Supabase's `/auth/v1/verify` endpoint, which then redirects to that
custom scheme — and a custom scheme only resolves on a device with the app
installed.

Someone who opens the email on a laptop, which is most people, clicks the button
and lands on a browser error. The templates say "open this on the phone where you
installed Emode" to soften it, but copy is not a fix.

The real fix is one of:

- an Apple **universal link** (`https://www.emode.style/auth/...`) with an
  `apple-app-site-association` file, so the same URL opens the app on a phone and
  a real page on a desktop; or
- a plain web page at that URL that catches the token and tells the visitor to
  open the app.

Either needs work in both this repo and the website, so it is tracked here rather
than being silently absorbed into the email copy.
