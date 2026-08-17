// Marketplace order checkout. One payment per seller (Stripe Connect destination
// charge); the cart screen calls this per seller group and presents Stripe's
// PaymentSheet. Amounts are computed server-side in the edge function.

import { supabase } from './supabase';

export interface ShippingDetails {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
}

export interface OrderLineItem {
    product_id: string;
    size?: string | null;
}

export interface OrderPaymentParams {
    clientSecret: string;
    ephemeralKey: string;
    customerId: string;
    orderId: string;
    amount: number;
    publishableKey: string;
}

/**
 * Create a pending order for one seller and a Stripe PaymentIntent (destination
 * charge to that seller). Throws Error('seller_not_connected') when the seller
 * hasn't finished payout onboarding so the caller can skip them gracefully.
 */
export async function createOrderPayment(
    sellerId: string,
    items: OrderLineItem[],
    shipping: ShippingDetails,
): Promise<OrderPaymentParams> {
    const { data, error } = await supabase.functions.invoke('create-order-payment', {
        body: { seller_id: sellerId, items, shipping },
    });

    if (error) {
        let reason = error.message || 'Failed to start checkout';
        try {
            const body = await error.context?.json?.();
            if (body?.error) reason = body.error;
        } catch {
            // ignore parse failures
        }
        throw new Error(reason);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as OrderPaymentParams;
}
