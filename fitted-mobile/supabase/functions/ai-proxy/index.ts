// @ts-nocheck
// Authenticated Google Gemini proxy. Enforces consent, payload bounds, paid
// entitlement limits, abuse throttles, and server-side generation accounting.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const IMAGE_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') || 'gemini-3-pro-image-preview';
const FREE_DAILY_LIMIT = 15;
const PRO_DAILY_LIMIT = 100;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CLOTHING_IMAGES = 6;

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

function cleanBase64(value: unknown): string | null {
    if (typeof value !== 'string' || !value) return null;
    const clean = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(clean)) return null;
    if (Math.ceil(clean.length * 0.75) > MAX_IMAGE_BYTES) return null;
    return clean.replace(/[\r\n]/g, '');
}

async function recordGeneration(userId: string, status: 'succeeded' | 'failed' | 'blocked', usedFace: boolean) {
    const { error } = await admin.from('generations').insert({
        user_id: userId,
        provider: 'google-gemini',
        model: IMAGE_MODEL,
        status,
        used_face_photo: usedFace,
    });
    if (error) console.error('generation accounting failed', error.message);
}

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'content-type': 'application/json' },
    });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 52 * 1024 * 1024) return json({ error: 'Request is too large' }, 413);

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);
        if (!GEMINI_API_KEY) return json({ error: 'AI is not configured' }, 503);

        const payload = await req.json();
        const action = payload?.action;

        if (action === 'generate-outfit') {
            const clothing = Array.isArray(payload?.clothingImagesBase64) ? payload.clothingImagesBase64 : [];
            if (clothing.length < 1 || clothing.length > MAX_CLOTHING_IMAGES) {
                return json({ error: `Choose between 1 and ${MAX_CLOTHING_IMAGES} clothing images` }, 400);
            }
            const cleanClothing = clothing.map(cleanBase64);
            if (cleanClothing.some((image: string | null) => !image)) {
                return json({ error: `Each image must be a supported file under ${MAX_IMAGE_BYTES / 1024 / 1024} MB` }, 400);
            }

            const faceProvided = !!payload?.facePhotoBase64;
            const cleanFace = faceProvided ? cleanBase64(payload.facePhotoBase64) : null;
            if (faceProvided && !cleanFace) return json({ error: 'The face image is invalid or too large' }, 400);

            if (faceProvided) {
                const { data: settings } = await admin
                    .from('user_settings')
                    .select('ai_face_consent_at')
                    .eq('user_id', user.id)
                    .single();
                if (!settings?.ai_face_consent_at) {
                    await recordGeneration(user.id, 'blocked', true);
                    return json({ error: 'AI face consent is required', code: 'consent_required' }, 403);
                }
            }

            const { data: profile } = await admin
                .from('users')
                .select('has_pro_tryons')
                .eq('id', user.id)
                .single();
            const dailyLimit = profile?.has_pro_tryons ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            const { count } = await admin
                .from('generations')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('status', 'succeeded')
                .gte('created_at', today.toISOString());
            if ((count || 0) >= dailyLimit) {
                const tomorrow = new Date(today);
                tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
                return json({
                    error: 'Daily outfit-generation limit reached',
                    code: 'daily_limit',
                    limit: dailyLimit,
                    retryAfterSeconds: Math.max(1, Math.ceil((tomorrow.getTime() - Date.now()) / 1000)),
                }, 429);
            }

            const rate = await checkRateLimit(user.id, 'ai:generate-outfit', 30, 3600);
            if (!rate.allowed) return rateLimitResponse(rate, cors);

            const background = String(payload?.backgroundPrompt || 'a clean, neutral studio background').slice(0, 300);
            const parts: any[] = [{
                text: `Create one tasteful, non-sexual, photorealistic 1:1 fashion visualization using the supplied clothing. Preserve normal anatomy and the clothing's intended fit. Background: ${background}. Do not add logos, text, minors, nudity, or unsafe content.`,
            }];
            if (cleanFace) {
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanFace } });
                parts.push({ text: 'Use this consenting adult reference only to preserve their visible facial appearance.' });
            }
            cleanClothing.forEach((image: string, index: number) => {
                parts.push({ inlineData: { mimeType: 'image/png', data: image } });
                parts.push({ text: `Clothing reference ${index + 1}.` });
            });

            const response = await fetch(`${GEMINI_BASE}/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    ],
                }),
            });
            if (!response.ok) {
                console.error('Gemini image request failed', response.status);
                await recordGeneration(user.id, 'failed', faceProvided);
                return json({ error: 'The AI provider could not generate this outfit' }, 502);
            }

            const data = await response.json();
            const responseParts = data?.candidates?.[0]?.content?.parts || [];
            const image = responseParts.find((part: any) => part.inlineData?.data)?.inlineData?.data;
            if (!image) {
                const blocked = !!data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason === 'SAFETY';
                await recordGeneration(user.id, blocked ? 'blocked' : 'failed', faceProvided);
                return json({
                    error: blocked ? 'This request could not be generated under the safety rules' : 'No image was generated',
                    code: blocked ? 'safety_block' : 'generation_failed',
                }, blocked ? 422 : 502);
            }

            await recordGeneration(user.id, 'succeeded', faceProvided);
            return json({ image: `data:image/png;base64,${image}`, remaining: Math.max(0, dailyLimit - (count || 0) - 1) });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error: any) {
        console.error('ai-proxy error', error?.message);
        return json({ error: 'Request failed' }, 500);
    }
});
