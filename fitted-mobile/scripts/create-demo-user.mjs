// Create (or reset) a demo account for App Store / Play Store review.
//
// Apple REQUIRES working demo credentials whenever the app is behind a login
// wall. This seeds a confirmed user via the Supabase Admin API so reviewers can
// sign straight in.
//
// Usage (PowerShell) — the service-role key is a SECRET; pass it inline, never
// commit it:
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"; node scripts/create-demo-user.mjs
//
// Optional overrides:
//   $env:DEMO_EMAIL="review@fitted.app"
//   $env:DEMO_PASSWORD="SomeStrongPassword!"
//   $env:SUPABASE_URL="https://xxxx.supabase.co"   (defaults to the project URL)
//
// Get the service_role key from: Supabase Dashboard → Project Settings → API →
// "service_role" secret. It bypasses RLS — keep it off disk and out of git.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    'https://scvvbjheyfnxlsiiozta.supabase.co';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'appreview@fitted.app';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'FittedReview!2026';

if (!SERVICE_ROLE_KEY) {
    console.error(
        'Missing SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Run:  $env:SUPABASE_SERVICE_ROLE_KEY="<key>"; node scripts/create-demo-user.mjs'
    );
    process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
    // Paginate through users (no direct get-by-email in the admin API).
    for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (match) return match;
        if (data.users.length < 200) break; // last page
    }
    return null;
}

async function main() {
    console.log(`Project: ${SUPABASE_URL}`);
    console.log(`Demo email: ${DEMO_EMAIL}`);

    const existing = await findUserByEmail(DEMO_EMAIL);

    if (existing) {
        const { error } = await admin.auth.admin.updateUserById(existing.id, {
            password: DEMO_PASSWORD,
            email_confirm: true,
        });
        if (error) throw error;
        console.log(`\n✓ Existing demo user updated (id: ${existing.id}). Password reset.`);
    } else {
        const { data, error } = await admin.auth.admin.createUser({
            email: DEMO_EMAIL,
            password: DEMO_PASSWORD,
            email_confirm: true, // skip the verification email so reviewers can log in immediately
        });
        if (error) throw error;
        console.log(`\n✓ Demo user created (id: ${data.user.id}).`);
    }

    console.log('\n──────────── Paste into App Store Connect ────────────');
    console.log(`  Username: ${DEMO_EMAIL}`);
    console.log(`  Password: ${DEMO_PASSWORD}`);
    console.log('──────────────────────────────────────────────────────');
    console.log(
        '\nNote: the reviewer will go through onboarding on first launch. If any\n' +
        'feature is gated behind a subscription, either grant this user the\n' +
        'entitlement server-side or make sure the IAP is reviewable in sandbox.'
    );
}

main().catch((err) => {
    console.error('\nFailed:', err.message || err);
    process.exit(1);
});
