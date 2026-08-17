// Payment & Service Configuration
// Values come from environment variables (set in .env.local)
// EXPO_PUBLIC_ prefix makes them available in client code

export const STRIPE_CONFIG = {
    publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
    // Merchant identifier for Apple Pay (configure in Apple Developer portal)
    merchantIdentifier: 'merchant.com.emode.app',
    // URL scheme for return URLs after 3D Secure etc.
    urlScheme: 'emode',
};

export const REVENUECAT_CONFIG = {
    iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || '',
    androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || '',
    // Product identifiers — must match what you create in App Store Connect / Google Play Console
    products: {
        stylistMonthly: 'emode_stylist_monthly',
        businessMonthly: 'emode_business_monthly',
        proTryOnsMonthly: 'emode_pro_tryons_monthly',
    },
    // Entitlement identifiers — must match what you create in RevenueCat dashboard
    entitlements: {
        verifiedStylist: 'verified_stylist',
        businessAccount: 'business_account',
        proTryOns: 'pro_tryons',
    },
};

export const PLATFORM_CONFIG = {
    // Percentage Emode takes from each styling transaction
    feePercent: parseInt(process.env.EXPO_PUBLIC_PLATFORM_FEE_PERCENT || '15', 10),
};

// Supabase Edge Function base URL (set this to your project's function URL)
export const EDGE_FUNCTION_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
    ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
    : 'https://scvvbjheyfnxlsiiozta.supabase.co/functions/v1';
