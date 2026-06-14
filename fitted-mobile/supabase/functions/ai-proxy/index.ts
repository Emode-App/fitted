// @ts-nocheck
// supabase/functions/ai-proxy/index.ts
// Authenticated proxy for Google Gemini so the API key never ships in the app
// bundle. Requires a valid JWT. Two actions:
//   { action: 'generate-outfit', facePhotoBase64, clothingImagesBase64, backgroundPrompt }
//   { action: 'search-products', query }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

serve(async (req: Request) => {
    const cors = corsHeaders(req);
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    try {
        const { user, error } = await getUser(req);
        if (!user) return json({ error: error || 'Unauthorized' }, 401);

        if (!GEMINI_API_KEY) return json({ error: 'AI not configured' }, 500);

        const payload = await req.json();
        const action = payload?.action;

        // ── Outfit image generation ──────────────────────────────
        if (action === 'generate-outfit') {
            const { facePhotoBase64, clothingImagesBase64 = [], backgroundPrompt } = payload;
            if (!Array.isArray(clothingImagesBase64) || clothingImagesBase64.length === 0) {
                return json({ error: 'At least one clothing item is required' }, 400);
            }

            const parts: any[] = [{
                text: `Generate a hyper-realistic, high-fashion photo of a person wearing the clothing items provided below.
                       The style should be modern and trendy.
                       The fit of the clothes should differ to the specific item type (e.g. baggy pants should look baggy).
                       The background should be: ${backgroundPrompt || 'a clean, neutral studio background'}.
                       Output a single 1:1 aspect ratio image.`,
            }];

            if (facePhotoBase64) {
                const cleanFace = String(facePhotoBase64).split(',')[1] || facePhotoBase64;
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanFace } });
                parts.push({ text: 'Preserve the facial identity of this person in the generated image.' });
            }

            clothingImagesBase64.forEach((img: string, index: number) => {
                const cleanImg = String(img).split(',')[1] || img;
                parts.push({ inlineData: { mimeType: 'image/png', data: cleanImg } });
                parts.push({ text: `Wear this clothing item (${index + 1}).` });
            });

            const resp = await fetch(
                `${GEMINI_BASE}/gemini-3-pro-image-preview:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts }],
                        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
                    }),
                }
            );

            const data = await resp.json();
            const respParts = data?.candidates?.[0]?.content?.parts || [];
            for (const part of respParts) {
                if (part.inlineData?.data) {
                    return json({ image: `data:image/png;base64,${part.inlineData.data}` });
                }
            }
            return json({ error: 'No image generated' }, 502);
        }

        // ── Product search (Gemini text) ─────────────────────────
        if (action === 'search-products') {
            const query = String(payload?.query || '').trim();
            if (!query) return json({ products: [] });

            const prompt = `Search for clothing products matching "${query}".
Return a raw JSON array of 12 distinct items.
Each item object must strictly have these fields:
- "name" (string, precise product name)
- "brand" (string)
- "price" (number, estimate if needed)
- "sku" (string, optional - important for images)
- "imageUrl" (string, optional - if you find a very reliable one)
- "purchaseLink" (string, the direct product page URL on StockX. e.g. https://stockx.com/jordan-1-retro-high-og-chicago-lost-and-found)

Important:
1. Prioritize StockX links.
2. Do NOT return "vertexaisearch.com" or "google.com/url" redirect links. If the link looks like that, assume it is invalid.
3. If you can't find a direct link, construct a valid StockX URL using the product name.

Do not include markdown formatting or backticks. Just the raw JSON string.`;

            const resp = await fetch(
                `${GEMINI_BASE}/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                }
            );

            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

            let items: any[] = [];
            try {
                const parsed = JSON.parse(cleanText);
                if (Array.isArray(parsed)) items = parsed;
            } catch {
                items = [];
            }
            return json({ products: items });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error: any) {
        console.error('ai-proxy error:', error);
        return json({ error: error.message }, 500);
    }
});
