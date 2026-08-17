type CheckoutResult = Promise<{ error?: { message: string; code?: string } }>;

export function useStripeCheckout(): {
    available: boolean;
    initPaymentSheet: (options: Record<string, unknown>) => CheckoutResult;
    presentPaymentSheet: () => CheckoutResult;
};
