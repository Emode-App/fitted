import { supabase } from './supabase';

type AuthLinkResult = { handled: boolean; error?: Error; type?: string };
const handlingLinks = new Map<string, Promise<AuthLinkResult>>();

function authParams(url: string): URLSearchParams {
    const params = new URLSearchParams();
    for (const section of url.split(/[?#]/).slice(1)) {
        const values = new URLSearchParams(section);
        values.forEach((value, key) => params.set(key, value));
    }
    return params;
}

/** Applies Supabase's PKCE-code or token-fragment auth callback on native. */
export async function applySupabaseAuthLink(url: string | null | undefined) {
    if (!url || !url.startsWith('emode://')) return { handled: false };
    const existing = handlingLinks.get(url);
    if (existing) return existing;

    const params = authParams(url);
    const code = params.get('code');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!code && !(accessToken && refreshToken)) return { handled: false };

    const work = (async (): Promise<AuthLinkResult> => {
        const result = code
            ? await supabase.auth.exchangeCodeForSession(code)
            : await supabase.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! });
        if (result.error) handlingLinks.delete(url);
        return { handled: !result.error, error: result.error || undefined, type: params.get('type') || undefined };
    })();
    handlingLinks.set(url, work);
    return work;
}
