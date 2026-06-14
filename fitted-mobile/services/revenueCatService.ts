import { Platform } from 'react-native';
import { supabase } from './supabase';
import { REVENUECAT_CONFIG } from '@/constants/payments';

// ============================================
// REVENUECAT SERVICE
// Handles IAP subscriptions:
//   1. Stylist Verification ($25/mo)
//   2. Business Account ($15/mo)
//   3. Pro Try-Ons / Unlimited dressing room ($10/mo)
// ============================================

// RevenueCat SDK is imported dynamically to avoid crashes in Expo Go
let Purchases: any = null;

// Daily try-on limit for free users
export const FREE_DAILY_TRYON_LIMIT = 15;

/**
 * Initialize RevenueCat SDK. Call once on app startup.
 * Gracefully handles missing native module (Expo Go).
 */
export async function initializeRevenueCat(userId?: string): Promise<boolean> {
    try {
        const rc = require('react-native-purchases');
        Purchases = rc.default || rc;

        if (!REVENUECAT_CONFIG.apiKey) {
            console.warn('[RevenueCat] No API key configured');
            return false;
        }

        await Purchases.configure({
            apiKey: REVENUECAT_CONFIG.apiKey,
            appUserID: userId || null,
        });

        console.log('[RevenueCat] Initialized successfully');
        return true;
    } catch (error: any) {
        console.warn('[RevenueCat] Not available (expected in Expo Go):', error.message);
        Purchases = null;
        return false;
    }
}

/**
 * Identify the current user with RevenueCat (call after login).
 */
export async function identifyUser(userId: string): Promise<void> {
    if (!Purchases) return;
    try {
        await Purchases.logIn(userId);
        console.log('[RevenueCat] User identified:', userId);
    } catch (error) {
        console.error('[RevenueCat] Failed to identify user:', error);
    }
}

// ============================================
// GENERIC PURCHASE HELPER
// ============================================

type SubscriptionType = 'stylist' | 'business' | 'proTryOns';

const SUBSCRIPTION_META: Record<SubscriptionType, {
    productId: string;
    entitlementId: string;
    dbField: string;
    dbValue: any;
}> = {
    stylist: {
        productId: REVENUECAT_CONFIG.products.stylistMonthly,
        entitlementId: REVENUECAT_CONFIG.entitlements.verifiedStylist,
        dbField: 'is_verified_stylist',
        dbValue: true,
    },
    business: {
        productId: REVENUECAT_CONFIG.products.businessMonthly,
        entitlementId: REVENUECAT_CONFIG.entitlements.businessAccount,
        dbField: 'is_business_account',
        dbValue: true,
    },
    proTryOns: {
        productId: REVENUECAT_CONFIG.products.proTryOnsMonthly,
        entitlementId: REVENUECAT_CONFIG.entitlements.proTryOns,
        dbField: 'subscription_status', // We'll use a separate field
        dbValue: 'pro_tryons',
    },
};

/**
 * Purchase a subscription of the given type.
 * Returns { success, error } — error='cancelled' if user cancelled.
 */
export async function purchaseSubscription(type: SubscriptionType): Promise<{
    success: boolean;
    error?: string;
}> {
    if (!Purchases) {
        return {
            success: false,
            error: 'In-app purchases are not available. Please use a development build to test purchases.',
        };
    }

    const meta = SUBSCRIPTION_META[type];

    try {
        const offerings = await Purchases.getOfferings();
        const currentOffering = offerings.current;

        if (!currentOffering) {
            return { success: false, error: 'No subscription offerings available' };
        }

        // Find the correct package
        const pkg = currentOffering.availablePackages?.find(
            (p: any) => p.product?.identifier === meta.productId
        ) || currentOffering.monthly || currentOffering.availablePackages?.[0];

        if (!pkg) {
            return { success: false, error: `Subscription package not found for ${type}` };
        }

        const { customerInfo } = await Purchases.purchasePackage(pkg);
        const isActive = customerInfo.entitlements.active[meta.entitlementId];

        if (isActive) {
            return { success: true };
        } else {
            return { success: false, error: 'Purchase completed but entitlement not active' };
        }
    } catch (error: any) {
        if (error.userCancelled) {
            return { success: false, error: 'cancelled' };
        }
        console.error(`[RevenueCat] ${type} purchase error:`, error);
        return { success: false, error: error.message || 'Purchase failed' };
    }
}

// ============================================
// CONVENIENCE WRAPPERS
// ============================================

/** Purchase the Stylist Subscription ($25/mo) */
export const purchaseStylistSubscription = () => purchaseSubscription('stylist');

/** Purchase the Business Account Subscription ($15/mo) */
export const purchaseBusinessSubscription = () => purchaseSubscription('business');

/** Purchase the Pro Try-Ons Subscription ($10/mo) */
export const purchaseProTryOnsSubscription = () => purchaseSubscription('proTryOns');

// ============================================
// STATUS CHECKS
// ============================================

/**
 * Check if the user has an active entitlement of the given type.
 */
export async function checkEntitlement(type: SubscriptionType): Promise<{
    isActive: boolean;
    expirationDate?: string;
}> {
    if (!Purchases) {
        return { isActive: false };
    }

    try {
        const customerInfo = await Purchases.getCustomerInfo();
        const meta = SUBSCRIPTION_META[type];
        const entitlement = customerInfo.entitlements.active[meta.entitlementId];

        return {
            isActive: !!entitlement,
            expirationDate: entitlement?.expirationDate,
        };
    } catch (error) {
        console.error(`[RevenueCat] ${type} status check error:`, error);
        return { isActive: false };
    }
}

/** Check if user has active Stylist subscription */
export const checkStylistSubscription = () => checkEntitlement('stylist');

/** Check if user has active Business Account subscription */
export const checkBusinessSubscription = () => checkEntitlement('business');

/** Check if user has active Pro Try-Ons subscription */
export const checkProTryOnsSubscription = () => checkEntitlement('proTryOns');

// ============================================
// RESTORE & SYNC
// ============================================

/**
 * Restore previous purchases (e.g., after reinstall or new device).
 */
export async function restorePurchases(): Promise<{
    success: boolean;
    activeEntitlements: string[];
    error?: string;
}> {
    if (!Purchases) {
        return {
            success: false,
            activeEntitlements: [],
            error: 'In-app purchases are not available in Expo Go.',
        };
    }

    try {
        const customerInfo = await Purchases.restorePurchases();
        const activeEntitlements = Object.keys(customerInfo.entitlements.active);

        return { success: true, activeEntitlements };
    } catch (error: any) {
        console.error('[RevenueCat] Restore error:', error);
        return { success: false, activeEntitlements: [], error: error.message };
    }
}

export interface EntitlementFlags {
    is_verified_stylist: boolean;
    is_business_account: boolean;
    subscription_status: string;
}

/**
 * Ask the server to (re)verify this user's entitlements with RevenueCat and
 * write the resulting flags. The client can no longer set these flags directly
 * — the `sync-entitlement` edge function checks RevenueCat with a secret key and
 * is the only writer of is_verified_stylist / is_business_account.
 *
 * `type` is accepted for call-site compatibility but the server always syncs all
 * entitlements at once. Returns the verified flags, or null on failure.
 */
export async function syncSubscriptionToSupabase(
    _userId?: string,
    _type?: SubscriptionType,
    _isActive?: boolean
): Promise<EntitlementFlags | null> {
    try {
        const { data, error } = await supabase.functions.invoke('sync-entitlement', {
            body: { type: _type },
        });
        if (error) {
            console.error('[RevenueCat] sync-entitlement failed:', error.message);
            return null;
        }
        return data as EntitlementFlags;
    } catch (error) {
        console.error('[RevenueCat] Sync error:', error);
        return null;
    }
}

// ============================================
// DAILY TRY-ON USAGE TRACKING
// ============================================

/**
 * Get today's try-on usage count for a user.
 */
export async function getDailyTryOnCount(userId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const { data, error } = await supabase
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00Z`)
        .lt('created_at', `${today}T23:59:59Z`);

    if (error) {
        console.error('[TryOn] Error fetching daily count:', error);
        return 0;
    }

    // The count is in the response headers when using head: true
    // Fallback: query with count
    const { count } = await supabase
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00Z`);

    return count || 0;
}

/**
 * Check if user can perform a try-on (has remaining free uses or has Pro subscription).
 */
export async function canPerformTryOn(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    isPro: boolean;
}> {
    // Check if user has Pro Try-Ons subscription
    const { isActive: isPro } = await checkProTryOnsSubscription();

    if (isPro) {
        return { allowed: true, remaining: Infinity, isPro: true };
    }

    // Check daily usage
    const usedToday = await getDailyTryOnCount(userId);
    const remaining = Math.max(0, FREE_DAILY_TRYON_LIMIT - usedToday);

    return {
        allowed: remaining > 0,
        remaining,
        isPro: false,
    };
}
