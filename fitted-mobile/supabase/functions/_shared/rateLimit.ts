// @ts-nocheck
// Shared per-user rate limiting for edge functions, backed by the
// public.check_rate_limit Postgres function (atomic fixed-window counter).
//
// Uses the service role so the counter table is never client-writable. Identity
// MUST come from the verified JWT (auth.ts getUser), never from the request body.
//
// Fail closed if the limiter itself errors. These endpoints call metered
// providers, so a counter outage must not become an unbounded-cost bypass.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    limit: number;
    retryAfterSeconds: number;
    unavailable?: boolean;
}

/**
 * Increment the caller's window for `action` and report whether they're within
 * budget. `action` should be namespaced (e.g. 'ai:generate-outfit').
 */
export async function checkRateLimit(
    userId: string,
    action: string,
    max: number,
    windowSeconds: number,
): Promise<RateLimitResult> {
    try {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data, error } = await admin.rpc('check_rate_limit', {
            p_user_id: userId,
            p_action: action,
            p_max: max,
            p_window_seconds: windowSeconds,
        });

        if (error || !data) {
            console.error('rate limit check failed (blocking):', error?.message);
            return { allowed: false, remaining: 0, limit: max, retryAfterSeconds: 60, unavailable: true };
        }

        const resetAt = new Date(data.reset_at).getTime();
        const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
        return {
            allowed: data.allowed === true,
            remaining: typeof data.remaining === 'number' ? data.remaining : 0,
            limit: typeof data.limit === 'number' ? data.limit : max,
            retryAfterSeconds,
        };
    } catch (err: any) {
        console.error('rate limit check threw (blocking):', err?.message);
        return { allowed: false, remaining: 0, limit: max, retryAfterSeconds: 60, unavailable: true };
    }
}

/** Standard 429 response for a blocked request, including a Retry-After header. */
export function rateLimitResponse(
    result: RateLimitResult,
    cors: Record<string, string>,
): Response {
    const unavailable = result.unavailable === true;
    return new Response(
        JSON.stringify({
            error: unavailable
                ? 'Usage controls are temporarily unavailable. Please try again shortly.'
                : 'Rate limit exceeded. Please slow down and try again later.',
            code: unavailable ? 'rate_limit_unavailable' : 'rate_limited',
            retryAfterSeconds: result.retryAfterSeconds,
        }),
        {
            status: unavailable ? 503 : 429,
            headers: {
                ...cors,
                'Content-Type': 'application/json',
                'Retry-After': String(result.retryAfterSeconds),
            },
        },
    );
}
