
/**
 * STRIPE SERVICE ADAPTER
 * 
 * Currently mocks payment processing.
 * To go live: Replace these functions with real Stripe.js / Backend API calls.
 */

interface ProcessPaymentResult {
    success: boolean;
    transactionId?: string;
    error?: string;
}

// Mock delay to simulate network request
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const stripeService = {
    /**
     * Process a one-time payment (e.g. Verification or DM Payment)
     */
    processPayment: async (amount: number, description: string): Promise<ProcessPaymentResult> => {
        console.log(`[Stripe Mock] Processing payment of $${amount} for: ${description}`);
        
        await delay(1500); // Simulate processing time

        // Simulate random failure (optional, currently always succeeds)
        const isSuccess = true;

        if (isSuccess) {
            return {
                success: true,
                transactionId: `txn_${Date.now()}_mock`
            };
        } else {
            return {
                success: false,
                error: "Card declined"
            };
        }
    },

    /**
     * Create a Stripe Connect account for a Stylist (Placeholder)
     */
    createConnectAccount: async (userId: string) => {
        console.log(`[Stripe Mock] Creating Connect account for ${userId}`);
        await delay(1000);
        return { success: true, accountId: `acct_${userId}_mock` };
    }
};
