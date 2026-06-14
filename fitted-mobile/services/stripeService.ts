import { supabase } from './supabase';

// ============================================
// STRIPE SERVICE
// Client-side helpers for Stripe operations.
// All sensitive identity (user id, email, stripe account) is derived from the
// caller's JWT inside the edge functions — the client never sends it.
// ============================================

interface PaymentIntentResponse {
    clientSecret: string;
    ephemeralKey: string;
    customerId: string;
    publishableKey: string;
    paymentIntentId?: string;
}

/**
 * Create a PaymentIntent for a styling session via Supabase Edge Function.
 * The edge function verifies the caller is a participant of the conversation,
 * looks up the stylist's connected account server-side, and computes the fee.
 *
 * Throws Error('stylist_not_connected') when the stylist has no payout account
 * so the caller can fall back to the simulated flow.
 */
export async function fetchPaymentIntent(
    amount: number,
    conversationId: string,
    stylistUserId: string,
    description: string
): Promise<PaymentIntentResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            conversation_id: conversationId,
            stylist_user_id: stylistUserId,
            description,
        },
    });

    if (error) {
        // Supabase wraps non-2xx as FunctionsHttpError; surface the server reason.
        let reason = error.message || 'Failed to create payment intent';
        try {
            const body = await error.context?.json?.();
            if (body?.error) reason = body.error;
        } catch {
            // ignore parse failures
        }
        throw new Error(reason);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as PaymentIntentResponse;
}

/**
 * Create a Stripe Connect Express account for the current user.
 * Identity comes from the JWT inside the edge function.
 */
export async function createConnectAccount(): Promise<{ accountId: string }> {
    const { data, error } = await supabase.functions.invoke('create-connect-account', { body: {} });
    if (error) throw new Error(error.message || 'Failed to create Connect account');
    return data as { accountId: string };
}

/**
 * Get an Account Link URL for the current user's Stripe Connect onboarding.
 */
export async function getConnectOnboardingUrl(): Promise<{ url: string }> {
    const { data, error } = await supabase.functions.invoke('create-connect-link', { body: {} });
    if (error) throw new Error(error.message || 'Failed to create onboarding link');
    return data as { url: string };
}

/**
 * Check if the current user has completed Stripe Connect onboarding.
 * Reads from the private_users table (only the owner can read their own row).
 */
export async function checkConnectStatus(userId: string): Promise<{
    hasAccount: boolean;
    onboardingComplete: boolean;
    accountId: string | null;
}> {
    const { data, error } = await supabase
        .from('private_users')
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
