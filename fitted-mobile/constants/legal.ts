const LEGAL_BASE = 'https://scvvbjheyfnxlsiiozta.supabase.co/functions/v1/legal';

// Public, version-controlled fallbacks remain reachable even before the custom
// emode.style domain is configured. Production may override them at build time.
export const LEGAL = {
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || `${LEGAL_BASE}/privacy`,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL || `${LEGAL_BASE}/terms`,
    supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL || `${LEGAL_BASE}/support`,
    accountDeletionUrl: process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL || `${LEGAL_BASE}/delete-account`,
    supportEmail: 'support@emode.style',
    termsVersion: '2026-08-17',
    aiConsentVersion: '2026-08-12',
};
