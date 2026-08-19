# Auth email templates

Branded replacements for Supabase's default auth emails.

**These are already live** on project `scvvbjheyfnxlsiiozta`. The files here are
the source of truth — edit one, then re-apply it (see below) so the dashboard and
the repo do not drift apart.

| File | Template | Subject |
| --- | --- | --- |
| `confirm-signup.html` | Confirm signup | Confirm your Emode account |
| `reset-password.html` | Reset password | Reset your Emode password |
| `change-email.html` | Change email address | Confirm your new Emode email |

Magic Link, Invite and Reauthentication are left at their defaults — the app
uses email + password and never triggers them. Style them if that changes.

## Applying a change

The Studio Templates panel currently fails to load (it renders skeletons and
makes no API calls), so apply through the Management API instead. From a signed-in
`supabase.com/dashboard` page:

```js
const ref = 'scvvbjheyfnxlsiiozta';
const tok = JSON.parse(localStorage.getItem('supabase.dashboard.auth.token')).access_token;
await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    mailer_subjects_confirmation: 'Confirm your Emode account',
    mailer_templates_confirmation_content: '<the file contents>',
  }),
});
```

Field names per template:

| File | Subject field | Body field |
| --- | --- | --- |
| `confirm-signup.html` | `mailer_subjects_confirmation` | `mailer_templates_confirmation_content` |
| `reset-password.html` | `mailer_subjects_recovery` | `mailer_templates_recovery_content` |
| `change-email.html` | `mailer_subjects_email_change` | `mailer_templates_email_change_content` |

## Why they look like this

Table layout with inline styles throughout. Outlook renders mail through Word's
HTML engine, which ignores flexbox, grid and most `<style>` blocks, so structure
has to live in table attributes and appearance has to be inline. The palette
(`#F5F2EC` ground, black wordmark) matches the app's `emode` theme in
`components/CustomSplashScreen.tsx`.

## Sender

Custom SMTP is configured: `smtp.gomailify.com:465`, sending as **Emode
&lt;support@emode.style&gt;**. Mail no longer goes through Supabase's shared
service, which was rate limited and explicitly not for production.

Auth email rate limit is set to **100/hour** (`rate_limit_email_sent`). Supabase
will happily attempt more than the SMTP plan allows, so if signups start bouncing,
check the Mailify plan's own hourly cap before touching anything here.

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

## Footer links

The footers point at the `legal` edge function
(`/functions/v1/legal/privacy`, `/functions/v1/legal/terms`) rather than
`emode.style/app/*`. Those website pages were reverted and 404 today. Repoint the
footers once they are back up.
