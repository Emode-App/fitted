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
     * A styling session in progress.
     *
     * No screenshot exists yet -- the flow has not been run end to end. The
     * slide stands on its copy until there is a real session to capture, which
     * is exactly what the null fallback is for.
     */
    styling: null,
    /** A profile shop with live listings. */
    shop: require('@/assets/onboarding/shop.jpg'),
    /** The feed. */
    feed: require('@/assets/onboarding/feed.jpg'),
};
