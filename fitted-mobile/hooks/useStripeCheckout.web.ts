export function useStripeCheckout() {
    return {
        available: false,
        initPaymentSheet: async () => ({ error: { message: 'Native checkout is unavailable on web.' } }),
        presentPaymentSheet: async () => ({ error: { message: 'Native checkout is unavailable on web.' } }),
    };
}
