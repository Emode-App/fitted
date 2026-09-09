import { supabase } from './supabase';
import { REVENUECAT_CONFIG } from '@/constants/payments';
import { Platform } from 'react-native';

let Purchases: any = null;
let initialization: Promise<boolean> | null = null;
let configured = false;

export const FREE_DAILY_TRYON_LIMIT = 15;
export const PRO_DAILY_TRYON_LIMIT = 100;
// How many pieces one generation may reference. Enforced in the ai-proxy
// function -- these exist so the paywall quotes the real numbers rather than
// a copywriter's memory of them. Change both together.
export const FREE_CLOTHING_LIMIT = 6;
export const PRO_CLOTHING_LIMIT = 20;
// How far back the Dressing Room's history goes without Pro. Everything is
// kept either way -- this is what a free account can see, not what it has.
export const FREE_HISTORY_LIMIT = 3;
export type SubscriptionType = 'stylist' | 'business' | 'proTryOns';

const SUBSCRIPTIONS: Record<SubscriptionType, { productId: string; entitlementId: string }> = {
    stylist: { productId: REVENUECAT_CONFIG.products.stylistMonthly, entitlementId: REVENUECAT_CONFIG.entitlements.verifiedStylist },
    business: { productId: REVENUECAT_CONFIG.products.businessMonthly, entitlementId: REVENUECAT_CONFIG.entitlements.businessAccount },
    proTryOns: { productId: REVENUECAT_CONFIG.products.proTryOnsMonthly, entitlementId: REVENUECAT_CONFIG.entitlements.proTryOns },
};

export async function initializeRevenueCat(userId?: string): Promise<boolean> {
    if (!initialization) {
        initialization = (async () => {
            try {
                const module = require('react-native-purchases');
                Purchases = module.default || module;
                const apiKey = Platform.OS === 'ios'
                    ? REVENUECAT_CONFIG.iosApiKey
                    : REVENUECAT_CONFIG.androidApiKey;
                if (!apiKey) {
                    console.warn(`[RevenueCat] ${Platform.OS} public SDK key is not configured`);
                    Purchases = null;
                    return false;
                }
                await Purchases.configure({ apiKey, ...(userId ? { appUserID: userId } : {}) });
                configured = true;
                return true;
            } catch (error: any) {
                console.warn('[RevenueCat] Native SDK unavailable:', error?.message);
                Purchases = null;
                return false;
            }
        })();
    }
    const ready = await initialization;
    if (ready && userId) await identifyUser(userId);
    return ready;
}

export async function identifyUser(userId: string): Promise<void> {
    if (initialization) await initialization;
    else await initializeRevenueCat();
    if (!Purchases || !configured) return;
    try {
        await Purchases.logIn(userId);
        await syncSubscriptionToSupabase(userId);
    } catch (error) {
        console.error('[RevenueCat] Could not identify user:', error);
    }
}

export async function logOutPurchases(): Promise<void> {
    if (!Purchases) return;
    try { await Purchases.logOut(); } catch { /* Local Supabase sign-out must still proceed. */ }
}

async function exactPackage(type: SubscriptionType): Promise<any | null> {
    if (!Purchases && !(await initializeRevenueCat())) return null;
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages || [];
    return packages.find((item: any) => item.product?.identifier === SUBSCRIPTIONS[type].productId) || null;
}

export async function getSubscriptionPrice(type: SubscriptionType): Promise<string | null> {
    try {
        const pkg = await exactPackage(type);
        return pkg?.product?.priceString || pkg?.product?.price?.formatted || null;
    } catch {
        return null;
    }
}

export async function purchaseSubscription(type: SubscriptionType): Promise<{ success: boolean; error?: string }> {
    try {
        const pkg = await exactPackage(type);
        if (!pkg) return { success: false, error: 'This subscription is not available from the store right now.' };
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        if (!customerInfo?.entitlements?.active?.[SUBSCRIPTIONS[type].entitlementId]) {
            return { success: false, error: 'The store completed the purchase, but access is not active yet. Try Restore Purchases.' };
        }
        const flags = await syncSubscriptionToSupabase(undefined, type);
        if (!flags) return { success: false, error: 'The purchase was received but could not be verified by the server yet. Try Restore Purchases.' };
        return { success: true };
    } catch (error: any) {
        if (error?.userCancelled) return { success: false, error: 'cancelled' };
        console.error(`[RevenueCat] ${type} purchase failed:`, error);
        return { success: false, error: error?.message || 'Purchase failed' };
    }
}

export const purchaseStylistSubscription = () => purchaseSubscription('stylist');
export const purchaseBusinessSubscription = () => purchaseSubscription('business');
export const purchaseProTryOnsSubscription = () => purchaseSubscription('proTryOns');

export async function checkEntitlement(type: SubscriptionType): Promise<{ isActive: boolean; expirationDate?: string }> {
    if (!Purchases && !(await initializeRevenueCat())) return { isActive: false };
    try {
        const info = await Purchases.getCustomerInfo();
        const entitlement = info.entitlements.active[SUBSCRIPTIONS[type].entitlementId];
        return { isActive: !!entitlement, expirationDate: entitlement?.expirationDate };
    } catch {
        return { isActive: false };
    }
}

export const checkStylistSubscription = () => checkEntitlement('stylist');
export const checkBusinessSubscription = () => checkEntitlement('business');
export const checkProTryOnsSubscription = () => checkEntitlement('proTryOns');

export async function restorePurchases(): Promise<{ success: boolean; activeEntitlements: string[]; error?: string }> {
    if (!Purchases && !(await initializeRevenueCat())) {
        return { success: false, activeEntitlements: [], error: 'In-app purchases require an installed development or store build.' };
    }
    try {
        const info = await Purchases.restorePurchases();
        const activeEntitlements = Object.keys(info.entitlements.active || {});
        const flags = await syncSubscriptionToSupabase();
        if (!flags) return { success: false, activeEntitlements, error: 'Purchases were restored by the store but server verification is still pending.' };
        return { success: true, activeEntitlements };
    } catch (error: any) {
        return { success: false, activeEntitlements: [], error: error?.message || 'Restore failed' };
    }
}

export interface EntitlementFlags {
    is_verified_stylist: boolean;
    is_business_account: boolean;
    has_pro_tryons: boolean;
    subscription_status: 'none' | 'active' | 'expired' | 'canceled';
}

export async function syncSubscriptionToSupabase(
    _userId?: string,
    _type?: SubscriptionType,
    _isActive?: boolean,
): Promise<EntitlementFlags | null> {
    try {
        const { data, error } = await supabase.functions.invoke('sync-entitlement', { body: {} });
        if (error) return null;
        return data as EntitlementFlags;
    } catch {
        return null;
    }
}

export async function getDailyTryOnCount(userId: string): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const { count, error } = await supabase
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'succeeded')
        .gte('created_at', start.toISOString());
    return error ? 0 : count || 0;
}

export async function canPerformTryOn(userId: string): Promise<{ allowed: boolean; remaining: number; isPro: boolean }> {
    const [{ data: profile }, used] = await Promise.all([
        supabase.from('users').select('has_pro_tryons').eq('id', userId).single(),
        getDailyTryOnCount(userId),
    ]);
    const isPro = !!profile?.has_pro_tryons;
    const limit = isPro ? PRO_DAILY_TRYON_LIMIT : FREE_DAILY_TRYON_LIMIT;
    const remaining = Math.max(0, limit - used);
    return { allowed: remaining > 0, remaining, isPro };
}
