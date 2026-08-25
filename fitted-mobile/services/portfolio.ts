import { supabase } from '@/services/supabase';
import { captureException } from './monitoring';

export type PortfolioStatus = 'pending' | 'approved' | 'revoked';

export interface PortfolioItem {
    id: string;
    stylist_id: string;
    client_id: string;
    session_id: string | null;
    generated_image_url: string | null;   // public copy, only once approved
    board_image_url: string | null;
    source_generated_path?: string | null;
    source_board_path?: string | null;
    title: string | null;
    status: PortfolioStatus;
    display_order: number;
    requested_at: string;
    approved_at: string | null;
    client?: { id: string; handle?: string; username?: string; avatar_url?: string };
    stylist?: { id: string; handle?: string; username?: string; avatar_url?: string };
}

/**
 * A stylist asks to show a look they made.
 *
 * The look is of the client, so this only ever creates a request. Nothing is
 * visible to anybody else until the client answers -- the database enforces
 * that as well, since the insert policy will not accept a row that starts as
 * anything other than 'pending'.
 */
export async function requestPortfolioItem(params: {
    sessionId: string;
    clientId: string;
    // The private-media object paths of the delivery, not signed URLs. A
    // signed URL expires; the path is what the approval copies from.
    generatedPath?: string | null;
    boardPath?: string | null;
    title?: string;
}): Promise<PortfolioItem> {
    const { data: auth } = await supabase.auth.getUser();
    const stylistId = auth?.user?.id;
    if (!stylistId) throw new Error('Sign in to build your portfolio');

    const { data, error } = await supabase
        .from('portfolio_items')
        .insert({
            stylist_id: stylistId,
            client_id: params.clientId,
            session_id: params.sessionId,
            source_generated_path: params.generatedPath ?? null,
            source_board_path: params.boardPath ?? null,
            title: params.title ?? null,
            status: 'pending',
        })
        .select('*')
        .single();

    if (error) {
        // Asking twice about the same session is caught by a unique constraint
        // rather than allowed to become two notifications for one look.
        if (error.code === '23505') throw new Error('You have already asked about this look.');
        captureException(error, { feature: 'portfolio-request' });
        throw new Error(error.message || 'Could not send that request');
    }

    // Tell them. A question about somebody's own likeness should not wait in a
    // list they might never open.
    const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: params.clientId,
        actor_id: stylistId,
        type: 'portfolio_request',
        is_read: false,
    });
    if (notifyError) console.warn('Portfolio request notification failed:', notifyError.message);

    return data as PortfolioItem;
}

/**
 * The client's answer. Approving publishes the look; revoking pulls it back
 * out of the portfolio immediately and can be done at any point afterwards.
 *
 * Only the status column is writable by the client -- the rest is locked down
 * with column grants, so this cannot be turned into an edit of whose look it
 * is or which pictures it points at.
 */
export async function respondToPortfolioRequest(
    itemId: string,
    decision: 'approved' | 'revoked',
): Promise<void> {
    // Through the function rather than a direct update, because the answer has
    // consequences in storage: approving copies the look out of private-media
    // into the public bucket, and revoking deletes that copy. A plain status
    // change would leave a revoked look still fetchable by anyone holding the
    // URL, which is consent withdrawn in appearance only.
    const { data, error } = await supabase.functions.invoke('portfolio-decision', {
        body: { item_id: itemId, decision },
    });

    if (error) {
        captureException(error, { feature: 'portfolio-respond' });
        throw new Error(error.message || 'Could not save your answer');
    }
    if ((data as any)?.error) throw new Error((data as any).error);
}

/** What a visitor sees on a stylist's profile: approved looks, in the stylist's order. */
export async function getStylistPortfolio(stylistId: string): Promise<PortfolioItem[]> {
    const { data, error } = await supabase
        .from('portfolio_items')
        .select('*, client:users!portfolio_items_client_id_fkey(id, handle, username, avatar_url)')
        .eq('stylist_id', stylistId)
        .eq('status', 'approved')
        .order('display_order', { ascending: true })
        .order('approved_at', { ascending: false });

    if (error) {
        captureException(error, { feature: 'portfolio-list' });
        return [];
    }
    return (data ?? []) as PortfolioItem[];
}

/** Requests waiting on this person's answer. */
export async function getPendingPortfolioRequests(clientId: string): Promise<PortfolioItem[]> {
    const { data, error } = await supabase
        .from('portfolio_items')
        .select('*, stylist:users!portfolio_items_stylist_id_fkey(id, handle, username, avatar_url)')
        .eq('client_id', clientId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

    if (error) {
        captureException(error, { feature: 'portfolio-pending' });
        return [];
    }
    return (data ?? []) as PortfolioItem[];
}

/**
 * Everything the stylist has asked about, whatever the answer. Their own view
 * of the portfolio, where a pending request is worth showing as pending rather
 * than hidden.
 */
export async function getOwnPortfolio(stylistId: string): Promise<PortfolioItem[]> {
    const { data, error } = await supabase
        .from('portfolio_items')
        .select('*, client:users!portfolio_items_client_id_fkey(id, handle, username, avatar_url)')
        .eq('stylist_id', stylistId)
        .neq('status', 'revoked')
        .order('display_order', { ascending: true })
        .order('requested_at', { ascending: false });

    if (error) {
        captureException(error, { feature: 'portfolio-own' });
        return [];
    }
    return (data ?? []) as PortfolioItem[];
}
