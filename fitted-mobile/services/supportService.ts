import { supabase } from './supabase';

export async function submitSupportRequest(input: {
    email?: string;
    category?: string;
    subject: string;
    message: string;
}): Promise<{ error?: string }> {
    const message = input.message.trim();
    const subject = input.subject.trim();
    if (subject.length < 3 || message.length < 10) {
        return { error: 'Please include at least 10 characters describing the issue.' };
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Sign in before contacting support.' };
    const { error } = await supabase.from('support_requests').insert({
        user_id: user.id,
        email: input.email?.trim() || user.email || null,
        category: input.category || 'support',
        subject: subject.slice(0, 120),
        message: message.slice(0, 5000),
    });
    return error ? { error: error.message } : {};
}
