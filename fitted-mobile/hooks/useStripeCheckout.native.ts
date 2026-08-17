import { useStripe } from '@stripe/stripe-react-native';

export function useStripeCheckout() {
    const { initPaymentSheet, presentPaymentSheet } = useStripe();
    return { available: true, initPaymentSheet, presentPaymentSheet };
}
