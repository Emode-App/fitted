import { Alert, Linking } from 'react-native';
import { LEGAL } from '@/constants/legal';
import { supabase } from './supabase';

/**
 * Obtain explicit consent before a face photo is stored or sent to Google
 * Gemini. Consent is recorded server-side and can be revoked from Settings.
 */
export async function ensureAiFaceConsent(userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('user_settings')
        .select('ai_face_consent_at, ai_face_consent_version')
        .eq('user_id', userId)
        .single();

    if (!error && data?.ai_face_consent_at) return true;

    return new Promise((resolve) => {
        Alert.alert(
            'Use your face for AI try-on?',
            'If you agree, emode will privately store the face photo you choose and send it with selected clothing images to Google Gemini only when you request an AI outfit. Generated try-ons remain private unless you choose to publish one. You can revoke consent and delete this data in Privacy & Security.',
            [
                { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
                {
                    text: 'Privacy Policy',
                    onPress: () => {
                        Linking.openURL(LEGAL.privacyPolicyUrl).catch(() => {});
                        resolve(false);
                    },
                },
                {
                    text: 'I Agree',
                    onPress: async () => {
                        const { error: updateError } = await supabase
                            .from('user_settings')
                            .update({
                                ai_face_consent_at: new Date().toISOString(),
                                ai_face_consent_version: LEGAL.aiConsentVersion,
                                updated_at: new Date().toISOString(),
                            })
                            .eq('user_id', userId);
                        if (updateError) {
                            Alert.alert('Could Not Save Consent', 'Please try again before uploading a face photo.');
                            resolve(false);
                            return;
                        }
                        resolve(true);
                    },
                },
            ],
        );
    });
}

export async function revokeAiFaceConsent(): Promise<void> {
    const { data, error } = await supabase.functions.invoke('revoke-ai-consent', { body: {} });
    if (error) {
        let reason = error.message || 'Could not remove AI face data.';
        try {
            const payload = await error.context?.json?.();
            if (payload?.error) reason = payload.error;
        } catch {
            // Keep the transport error.
        }
        throw new Error(reason);
    }
    if (!data?.success) throw new Error('Could not remove AI face data.');
}
