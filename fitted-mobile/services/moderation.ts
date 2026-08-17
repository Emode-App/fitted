// UGC moderation helpers (Apple Guideline 1.2): reporting content and blocking
// users. Backed by the `reports` and `blocked_users` tables (RLS-scoped to the
// caller). Identity is taken from the current auth session.

import { supabase } from './supabase';
import { useAuthStore } from '../stores/authStore';

export type ReportContentType = 'post' | 'comment' | 'user' | 'message' | 'ai_generation' | 'product';

function currentUserId(): string | null {
    return useAuthStore.getState().user?.id ?? null;
}

/** File a report against a piece of content or a user. */
export async function reportContent(params: {
    contentType: ReportContentType;
    contentId?: string | null;
    reportedUserId?: string | null;
    reason?: string;
}): Promise<{ error?: string }> {
    const uid = currentUserId();
    if (!uid) return { error: 'You must be signed in to report.' };

    const { error } = await supabase.from('reports').insert({
        reporter_id: uid,
        content_type: params.contentType,
        content_id: params.contentId ?? null,
        reported_user_id: params.reportedUserId ?? null,
        reason: params.reason ?? null,
    });
    if (error?.code === '23505') return {};
    return error ? { error: error.message } : {};
}

/** Block a user. Idempotent. */
export async function blockUser(blockedId: string): Promise<{ error?: string }> {
    const uid = currentUserId();
    if (!uid) return { error: 'You must be signed in.' };
    if (uid === blockedId) return { error: "You can't block yourself." };

    const { error } = await supabase
        .from('blocked_users')
        .upsert({ blocker_id: uid, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
    return error ? { error: error.message } : {};
}

export async function unblockUser(blockedId: string): Promise<{ error?: string }> {
    const uid = currentUserId();
    if (!uid) return { error: 'You must be signed in.' };

    const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', uid)
        .eq('blocked_id', blockedId);
    return error ? { error: error.message } : {};
}

/** Ids of everyone the current user has blocked (for filtering feeds/profiles). */
export async function getBlockedUserIds(): Promise<string[]> {
    const uid = currentUserId();
    if (!uid) return [];
    const { data } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', uid);
    return (data || []).map((r: any) => r.blocked_id);
}

export async function isUserBlocked(blockedId: string): Promise<boolean> {
    const uid = currentUserId();
    if (!uid) return false;
    const { count } = await supabase
        .from('blocked_users')
        .select('*', { count: 'exact', head: true })
        .eq('blocker_id', uid)
        .eq('blocked_id', blockedId);
    return (count || 0) > 0;
}
