import type { ReactElement } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

import { STRIPE_CONFIG } from '@/constants/payments';

export default function AppStripeProvider({ children }: { children: ReactElement | ReactElement[] }) {
    if (!STRIPE_CONFIG.publishableKey) return children;

    return (
        <StripeProvider
            publishableKey={STRIPE_CONFIG.publishableKey}
            urlScheme={STRIPE_CONFIG.urlScheme}
            merchantIdentifier={STRIPE_CONFIG.merchantIdentifier}
        >
            {children}
        </StripeProvider>
    );
}
