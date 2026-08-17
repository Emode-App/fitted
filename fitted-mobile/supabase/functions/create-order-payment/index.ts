// @ts-nocheck
// Creates one destination-charge PaymentIntent per seller for physical goods.
// Inventory, amount, seller capability, and identity are all server-authoritative.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@19.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const API_VERSION = '2026-06-24.dahlia';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: API_VERSION });
const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

function validShipping(value: any) {
    const fields = ['name', 'line1', 'city', 'state', 'postal_code', 'country'];
    if (!value || fields.some((field) => typeof value[field] !== 'string' || !value[field].trim())) return null;
    const shipping = {
        name: value.name.trim().slice(0, 100),
        line1: value.line1.trim().slice(0, 200),
        line2: typeof value.line2 === 'string' ? value.line2.trim().slice(0, 200) : '',
        city: value.city.trim().slice(0, 100),
        state: value.state.trim().slice(0, 100),
        postal_code: value.postal_code.trim().slice(0, 20),
        country: value.country.trim().toUpperCase(),
    };
    if (!/^[A-Z]{2}$/.test(shipping.country)) return null;
    return shipping;
}

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'content-type': 'application/json' },
    });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let orderId: string | null = null;
    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        const input = await req.json();
        const sellerId = String(input?.seller_id || '');
        const items = Array.isArray(input?.items) ? input.items.map((item: any) => ({
            product_id: String(item?.product_id || ''),
            size: typeof item?.size === 'string' ? item.size.slice(0, 30) : null,
        })) : [];
        const shipping = validShipping(input?.shipping);
        if (!sellerId || items.length < 1 || items.length > 25 || items.some((item: any) => !/^[0-9a-f-]{36}$/i.test(item.product_id))) {
            return json({ error: 'Invalid seller or items' }, 400);
        }
        if (!shipping) return json({ error: 'A complete shipping address is required' }, 400);
        if (sellerId === user.id) return json({ error: 'You cannot buy your own listing' }, 400);

        const { data: seller } = await admin.from('private_users')
            .select('stripe_account_id').eq('id', sellerId).single();
        if (!seller?.stripe_account_id) return json({ error: 'seller_not_connected' }, 409);

        let account: any;
        try { account = await stripe.accounts.retrieve(seller.stripe_account_id); }
        catch { return json({ error: 'seller_not_connected' }, 409); }
        const ready = !account.deleted && account.details_submitted && account.payouts_enabled
            && account.capabilities?.transfers === 'active';
        await admin.from('private_users').update({ stripe_onboarding_complete: ready }).eq('id', sellerId);
        if (!ready) return json({ error: 'seller_not_connected' }, 409);

        const feePercent = Math.min(30, Math.max(0, Number(Deno.env.get('PLATFORM_FEE_PERCENT') || '15')));
        const { data: reservation, error: reserveError } = await admin.rpc('reserve_marketplace_order', {
            p_buyer_id: user.id,
            p_seller_id: sellerId,
            p_items: items,
            p_shipping: shipping,
            p_fee_percent: feePercent,
        });
        if (reserveError || !reservation?.order_id) {
            const message = reserveError?.message || '';
            if (/product_unavailable|invalid_size|duplicate_or_invalid_items/.test(message)) {
                return json({ error: 'Some items are no longer available in the selected size' }, 409);
            }
            console.error('order reservation failed', reserveError?.message);
            return json({ error: 'Could not reserve these items' }, 500);
        }
        orderId = reservation.order_id;

        const { data: buyer } = await admin.from('private_users')
            .select('stripe_customer_id').eq('id', user.id).single();
        let customerId = buyer?.stripe_customer_id || null;
        if (customerId) {
            try { await stripe.customers.retrieve(customerId); } catch { customerId = null; }
        }
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { emode_user_id: user.id },
            }, { idempotencyKey: `emode-customer-${user.id}` });
            customerId = customer.id;
            const { error: customerSaveError } = await admin.from('private_users')
                .update({ stripe_customer_id: customerId }).eq('id', user.id);
            if (customerSaveError) throw customerSaveError;
        }

        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customerId },
            { apiVersion: API_VERSION },
        );
        const paymentIntent = await stripe.paymentIntents.create({
            amount: reservation.subtotal,
            currency: 'usd',
            customer: customerId,
            receipt_email: user.email,
            application_fee_amount: reservation.fee,
            transfer_data: { destination: seller.stripe_account_id },
            metadata: { order_id: orderId, buyer_id: user.id, seller_id: sellerId, kind: 'physical_goods' },
            shipping: { name: shipping.name, address: {
                line1: shipping.line1, line2: shipping.line2 || undefined, city: shipping.city,
                state: shipping.state, postal_code: shipping.postal_code, country: shipping.country,
            } },
            automatic_payment_methods: { enabled: true },
        }, { idempotencyKey: `emode-order-${orderId}` });
        if (!paymentIntent.client_secret) throw new Error('PaymentIntent missing client secret');

        const { error: orderUpdateError } = await admin.from('orders')
            .update({ stripe_payment_intent_id: paymentIntent.id, updated_at: new Date().toISOString() })
            .eq('id', orderId).eq('status', 'pending');
        if (orderUpdateError) throw orderUpdateError;

        return json({
            clientSecret: paymentIntent.client_secret,
            ephemeralKey: ephemeralKey.secret,
            customerId,
            orderId,
            amount: reservation.subtotal,
            publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '',
        });
    } catch (error: any) {
        console.error('create-order-payment failed', error?.type || error?.message);
        if (orderId) await admin.rpc('release_marketplace_order', { p_order_id: orderId, p_reason: 'payment_initialization_failed' });
        return json({ error: 'Could not start checkout' }, 500);
    }
});
