// What a shared fit says once it leaves the app.
//
// Sharing was inconsistent and mostly dead-ended: the post screen attached
// `emode://post/<id>`, which does nothing for the person receiving it unless
// they already have the app installed; the profile share sent a bare line of
// text with no link at all; and the composer shared a bare image with no words.
// None of them told the recipient what made the picture or where to get it.

/** Where somebody without the app should land. */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6778471515';

const CREDIT = 'Made with Emode ✨';

/**
 * Build the caption that travels with a shared fit.
 *
 * The store link is embedded in the message rather than passed as Share's `url`.
 * iOS decides per-target whether to keep a separate url alongside the text, and
 * in Messages the link is the whole point — putting it in the body is the only
 * way to guarantee it arrives.
 */
export function shareCaption(lead?: string | null): string {
    const opening = lead?.trim();
    return [opening, CREDIT, APP_STORE_URL].filter(Boolean).join('\n\n');
}
