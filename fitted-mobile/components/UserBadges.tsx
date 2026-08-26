import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * The marks that say who somebody is, wherever they appear.
 *
 * These lived inline on the profile screen and nowhere else, which meant the
 * feed -- the most looked-at surface in the app -- showed a verified stylist
 * exactly the same as anybody else, and the person picking a stylist to pay had
 * nothing in front of them at the moment of choosing. Three call sites had
 * grown partial copies: explore drew the stylist mark only, the product card
 * drew the boutique mark only.
 *
 * One component so that adding a fourth kind of account is one edit rather than
 * a search, and so the same flag cannot mean a blue check in one list and
 * nothing in the next.
 *
 * Rendering is driven entirely by the flags on the row. Every one of them is
 * server-owned -- sync-entitlement writes them from RevenueCat, and the client
 * cannot set them -- so there is no case where this draws a mark somebody
 * granted themselves.
 */

/**
 * Only the fields that matter, so callers can pass any user-shaped row.
 *
 * Declared here rather than Pick<User, …> on purpose. Half the call sites read
 * a narrow row type of their own -- Liker, ConnectionUser, the activity actor --
 * and several come back from Postgres as `boolean | null` rather than optional.
 * Widening to accept both means a screen can hand over whatever its query
 * actually returns instead of casting, and a row that has not been widened to
 * fetch the flags simply draws nothing.
 */
export interface BadgeableUser {
    is_verified_stylist?: boolean | null;
    is_business_account?: boolean | null;
    is_verified_boutique?: boolean | null;
}

interface Props {
    user?: BadgeableUser | null;
    /**
     * Size of the stylist mark. The other two are drawn two points smaller,
     * which is not arbitrary: check-decagram, shopping-bag and shield-checkmark
     * come from three different icon sets and do not share a visual weight at
     * the same nominal size. The profile screen arrived at 20/18/18 by eye, and
     * keeping the ratio means every other surface inherits that judgement
     * instead of re-deriving it.
     */
    size?: number;
    style?: StyleProp<ViewStyle>;
    /**
     * Drop the wrapping View and return the marks bare.
     *
     * Comments and the activity feed build a sentence out of one flowing
     * <Text> -- a name, then the thing they did, wrapping across lines. A View
     * in the middle of that is laid out as a block and breaks the run. Icons
     * from @expo/vector-icons are Text glyphs underneath, so bare they sit in
     * the line like any other character. The caller supplies its own spacing,
     * because in a sentence the space belongs to the sentence.
     */
    inline?: boolean;
}

export default function UserBadges({ user, size = 14, style, inline = false }: Props) {
    if (!user) return null;

    const stylist = !!user.is_verified_stylist;
    const business = !!user.is_business_account;
    const boutique = !!user.is_verified_boutique;

    // Nothing to draw is the common case, and an empty View still costs a row
    // in the layout that pushes a handle sideways by the container's margin.
    if (!stylist && !business && !boutique) return null;

    const small = size - 2;

    const marks = (
        <>
            {stylist && (
                <MaterialCommunityIcons name="check-decagram" size={size} color={STYLIST_COLOR} />
            )}
            {business && <Feather name="shopping-bag" size={small} color={BUSINESS_COLOR} />}
            {boutique && <Ionicons name="shield-checkmark" size={small} color={BOUTIQUE_COLOR} />}
        </>
    );

    if (inline) return marks;

    return <View style={[styles.row, style]}>{marks}</View>;
}

const STYLIST_COLOR = '#3b82f6';
const BUSINESS_COLOR = '#3b82f6';
const BOUTIQUE_COLOR = '#22c55e';

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginLeft: 6,
    },
});
