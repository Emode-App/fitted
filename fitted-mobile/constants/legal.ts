// Legal documents live on emode.style, not on the Supabase function that used
// to serve them.
//
// The function set text/html and the platform gateway rewrote every response on
// *.supabase.co to text/plain with nosniff -- verified with no auth, with an
// api key, and with an explicit Accept: text/html. So the browser was told not
// to render it, and anyone tapping Terms in the paywall got a screenful of raw
// markup. App Review calls that a link that does not work: Guideline 3.1.2(c)
// asks for functional links to the Terms of Use and privacy policy from inside
// the app, and the same URLs go in App Store Connect.
//
// These are the app's own documents, deliberately separate from /privacy and
// /terms on the same site, which describe the merchant product -- the Shopify
// app, the storefront widget, merchants as data controllers -- and say nothing
// about face consent, stylist sessions or user reporting. Pointing the app at
// those would have handed Apple a policy for a different product.
//
// Nothing here points at Supabase. A shipped app should not send anyone to an
// infrastructure URL, and that one renders as plain text besides.
//
// Account deletion has no page on the site yet. The value is kept because App
// Store Connect has a field for it, but nothing in the app opens it -- deleting
// an account happens in the settings drawer, which is what Guideline 5.1.1(v)
// asks for. The link in Settings comes back when the page exists.
const SITE = 'https://www.emode.style';

export const LEGAL = {
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || `${SITE}/app/privacy`,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL || `${SITE}/app/terms`,
    supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL || `${SITE}/support`,
    accountDeletionUrl: process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL || `${SITE}/app/delete-account`,
    supportEmail: 'support@emode.style',
    termsVersion: '2026-08-17',
    aiConsentVersion: '2026-08-12',
};
