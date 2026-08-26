// Artwork for the onboarding slides.
//
// Each slot is either a require()d image or null. Null is not a failure state:
// the slide falls back to its emoji-and-gradient treatment, which is what every
// slide looked like before. That is what lets the styling slide ship with real
// copy before there is a screenshot of the flow to put behind it.
//
// The four that exist were cut out of the App Store screenshots in
// assets/screenshots -- the phone detected by its own black bezel, then cropped
// with the marketing copy above it removed. They are JPEG rather than PNG on
// purpose: nothing here needs transparency, the corners carry the same cream the
// slides are painted in (#F5F1EA against #F5F2EC, indistinguishable), and PNG
// cost 2.5MB against 322KB for the set.

import type { ImageSourcePropType } from 'react-native';

export type OnboardingSlot = 'board' | 'tryOn' | 'styling' | 'shop' | 'feed';

export const ONBOARDING_MEDIA: Record<OnboardingSlot, ImageSourcePropType | null> = {
    /** The polaroid canvas mid-build, tag pills showing. */
    board: require('@/assets/onboarding/board.jpg'),
    /** Outfit Preview with a generated fit and its shoppable pieces. */
    tryOn: require('@/assets/onboarding/try-on.jpg'),
    /**
     * A delivered styling session: the look, the pieces that make it up, and
     * the client it was sent to.
     *
     * This was null while the flow had never been run end to end. It has now --
     * a real booking, a real session, a real delivery -- so the slide has the
     * screenshot it was waiting for rather than the emoji fallback.
     */
    styling: require('@/assets/onboarding/styling.jpg'),
    /** A profile shop with live listings. */
    shop: require('@/assets/onboarding/shop.jpg'),
    /** The feed. */
    feed: require('@/assets/onboarding/feed.jpg'),
};
