/**
 * Turning a carrier and a number into a link out.
 *
 * Deliberately not a tracking integration. The app never asks a carrier
 * anything, holds no scan history and does not know where a parcel is -- it
 * hands the buyer over to the people who do. That keeps a seller from having to
 * relay "where is it" messages, which is the actual problem, without pretending
 * to information we have not got.
 */
export const CARRIERS = [
    { id: 'usps', label: 'USPS' },
    { id: 'ups', label: 'UPS' },
    { id: 'fedex', label: 'FedEx' },
    { id: 'dhl', label: 'DHL' },
    { id: 'other', label: 'Other' },
] as const;

export type CarrierId = typeof CARRIERS[number]['id'];

export function carrierLabel(id?: string | null): string {
    return CARRIERS.find((c) => c.id === id)?.label ?? 'Carrier';
}

/**
 * The carrier's own tracking page for this number.
 *
 * "Other" has no page of its own, so it returns null and the number is shown
 * as text to copy rather than a link that goes nowhere. A dead link is worse
 * than plain text: it looks like the app is broken rather than like the seller
 * used a carrier we do not have a URL for.
 */
export function trackingUrl(carrier?: string | null, number?: string | null): string | null {
    const code = (number ?? '').trim();
    if (!code) return null;

    switch (carrier) {
        case 'usps':
            return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(code)}`;
        case 'ups':
            return `https://www.ups.com/track?tracknum=${encodeURIComponent(code)}`;
        case 'fedex':
            return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(code)}`;
        case 'dhl':
            return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(code)}`;
        default:
            return null;
    }
}
