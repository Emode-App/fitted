import { supabase } from './supabase';
import { PLATFORM_CONFIG } from '@/constants/payments';

// ============================================
// STRIPE SERVICE
// Client-side helpers for Stripe operations
// ============================================

interface PaymentIntentResponse {
    clientSecret: string;
    ephemeralKey: string;
    customerId: string;
    publishableKey: string;
}

/**
 * Create a PaymentIntent for a styling session via Supabase Edge Function.
 * Uses destination charges to route funds to the stylist's connected account.
 */
export async function fetchPaymentIntent(
    amount: number,
    stylistStripeAccountId: string,
    conversationId: string,
    description: string
): Promise<PaymentIntentResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            stylist_stripe_account_id: stylistStripeAccountId,
            conversation_id: conversationId,
            description,
            platform_fee_percent: PLATFORM_CONFIG.feePercent,
        },
    });

    if (error) throw new Error(error.message || 'Failed to create payment intent');
    return data as PaymentIntentResponse;
}

/**
 * Create a Stripe Connect Express account for a stylist.
 */
export async function createConnectAccount(
    userId: string,
    email: string
): Promise<{ accountId: string }> {
    const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { user_id: userId, email },
    });

    if (error) throw new Error(error.message || 'Failed to create Connect account');
    return data as { accountId: string };
}

/**
 * Get an Account Link URL for Stripe Connect onboarding.
 */
export async function getConnectOnboardingUrl(
    stripeAccountId: string
): Promise<{ url: string }> {
    const { data, error } = await supabase.functions.invoke('create-connect-link', {
        body: { stripe_account_id: stripeAccountId },
    });

    if (error) throw new Error(error.message || 'Failed to create onboarding link');
    return data as { url: string };
}

/**
 * Check if a stylist has completed Stripe Connect onboarding.
 */
export async function checkConnectStatus(userId: string): Promise<{
    hasAccount: boolean;
    onboardingComplete: boolean;
    accountId: string | null;
}> {
    const { data, error } = await supabase
        .from('users')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('id', userId)
        .single();

    if (error || !data) {
        return { hasAccount: false, onboardingComplete: false, accountId: null };
    }

    return {
        hasAccount: !!data.stripe_account_id,
        onboardingComplete: data.stripe_onboarding_complete === true,
        accountId: data.stripe_account_id || null,
    };
}

/**
 * Get the stylist's Stripe account ID from a conversation.
 * (The "other user" in the conversation who is a verified stylist)
 */
export async function getStylistStripeAccountId(
    stylistUserId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from('users')
        .select('stripe_account_id')
        .eq('id', stylistUserId)
        .single();

    if (error || !data) return null;
    return data.stripe_account_id || null;
}
