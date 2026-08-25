# Brief for the emode.style repo: legal pages for the iOS app

## What this is for

The iOS app is being submitted to the App Store. Apple Guideline 3.1.2(c) requires
that an app selling auto-renewing subscriptions shows, **inside the app**,
functional links to a Terms of Use (EULA) and a privacy policy. The same URLs go
in App Store Connect. A link that resolves but does not render counts as
non-functional, and this is a live rejection reason we have already seen on
another app.

## Do not touch the existing pages

`/privacy` and `/terms` already exist and describe the **merchant** product — the
Shopify app, the storefront widget, the browser extension, merchants as data
controllers. Those are correct for that audience and should be left exactly as
they are. This brief only adds new pages.

## What to add

Three new static pages, same layout and styling as the existing legal pages:

| URL | Title | Source |
|---|---|---|
| `/app/terms` | emode Terms of Use | `app-terms-of-use.md` |
| `/app/privacy` | emode Privacy Policy | `app-privacy-policy.md` |
| `/support` | emode Support | see below |

The two markdown files are attached alongside this brief. Publish their content
verbatim — the wording is what App Review will be shown, and it has been written
to match what the app actually does (AI face consent, user content and
reporting, stylist sessions, marketplace orders, subscriptions).

`/support` currently 404s and is needed for the App Store Connect Support URL
field, which is mandatory. It only needs: what emode is in a sentence, a contact
address of `support@emode.style`, and a link to `/app/privacy`.

### Requirements for all three

- Served as `text/html` (this is the whole point — see below).
- Reachable without JavaScript, without a login, and without any cookie wall.
  App Review opens them cold in Safari.
- Mobile-legible. A reviewer opens these on an iPad.
- Linked from each other, and from the footer if the other legal pages are.
- Stable URLs. They will be baked into a shipped binary and into App Store
  Connect, so they cannot move without an app update.

## Why not just host them ourselves

They already exist, served by a Supabase edge function at
`.../functions/v1/legal/terms`. The function sets
`content-type: text/html; charset=utf-8`, and the Supabase gateway rewrites
every function response on `*.supabase.co` to `text/plain` with
`x-content-type-options: nosniff`. Verified with no auth, with an api key, and
with an explicit `Accept: text/html` — always `text/plain`. The browser is
therefore instructed not to treat it as HTML, and a reviewer tapping "Terms" in
the paywall sees a screenful of raw markup.

`emode.style` serves real `text/html`, so hosting them there fixes the rendering
and stops the app linking at a `supabase.co` URL, which looks wrong to anyone who
reads it.

## What happens after

Once the three pages are live, the app's `constants/legal.ts` gets pointed at
them and a new build goes to TestFlight. Nothing else in the app changes.
