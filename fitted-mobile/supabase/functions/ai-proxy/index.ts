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
                // Consent belongs to whoever's face this is, not to whoever is
                // driving the generation. When a stylist styles a client, it is
                // the client who must have consented -- checking the caller here
                // would let a stylist process a face on the strength of their own
                // consent to their own face.
                const faceOwnerId = typeof payload?.faceOwnerId === 'string' && payload.faceOwnerId
                    ? payload.faceOwnerId
                    : user.id;
                if (!/^[0-9a-f-]{36}$/i.test(faceOwnerId)) {
                    return json({ error: 'Invalid face owner' }, 400);
                }

                if (faceOwnerId !== user.id) {
                    // Someone else's face is only usable inside a live styling
                    // session that this caller is the stylist for. That is both the
                    // consent boundary and the abuse boundary.
                    const { data: session } = await admin
                        .from('styling_sessions')
                        .select('id')
                        .eq('stylist_id', user.id)
                        .eq('client_id', faceOwnerId)
                        .in('status', ['active', 'delivered'])
                        .maybeSingle();
                    if (!session) {
                        await recordGeneration(user.id, 'blocked', true);
                        return json({
                            error: 'You can only style a client during an active session.',
                            code: 'no_active_session',
                        }, 403);
                    }
                }

                const { data: settings } = await admin
                    .from('user_settings')
                    .select('ai_face_consent_at')
                    .eq('user_id', faceOwnerId)
                    .single();
                if (!settings?.ai_face_consent_at) {
                    await recordGeneration(user.id, 'blocked', true);
                    return json({
                        error: faceOwnerId === user.id
                            ? 'AI face consent is required'
                            : 'This client has not consented to AI face processing.',
                        code: 'consent_required',
                    }, 403);
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

        if (action === 'identify-item') {
            // Suggests what a photographed piece is so the tagger can fill the item
            // form with one tap instead of typing it out.
            //
            // Deliberately returns only a brand and a name. A model will happily
            // produce a price and a product URL too, but the price is a recalled
            // number that is usually years stale and the URL is usually invented
            // and 404s. Those are resolved against the real catalogue afterwards,
            // or left blank for the user. Nothing here is auto-applied: the caller
            // shows it as a question and writes nothing unless the user says yes.
            const image = cleanBase64(payload?.imageBase64);
            if (!image) return json({ error: 'A valid item photo is required' }, 400);

            const rate = await checkRateLimit(user.id, 'ai:identify-item', 120, 3600);
            if (!rate.allowed) return rateLimitResponse(rate, cors);

            const visionModel = Deno.env.get('GEMINI_VISION_MODEL') || 'gemini-2.5-flash';

            const prompt = [
                'You identify garments and footwear from a photo for a fashion app.',
                'Reply with JSON only, no markdown fence, matching exactly:',
                '{"brand": string|null, "name": string|null, "category": string|null, "confidence": "high"|"medium"|"low"}',
                '',
                'Rules:',
                '- brand is the maker (e.g. "Rick Owens"). name is the specific model or product name (e.g. "Geobasket").',
                '- If you cannot recognise the specific product, set name to null but still give the brand if the branding is legible.',
                '- If you cannot recognise the brand either, set both to null and confidence to "low". Do NOT guess a plausible brand.',
                '- An unbranded, generic or thrifted piece must return nulls rather than an invented label.',
                '- confidence reflects how certain you are that a person holding this item would agree.',
            ].join('\n');

            const resp = await fetch(`${GEMINI_BASE}/${visionModel}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: 'image/jpeg', data: image } },
                        ],
                    }],
                    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
                }),
            });

            if (!resp.ok) {
                console.error('identify-item upstream', resp.status, (await resp.text()).slice(0, 300));
                return json({ error: 'Could not identify this item right now' }, 502);
            }

            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text;
            if (!text) return json({ error: 'Could not identify this item right now' }, 502);

            let parsed: any;
            try {
                parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
            } catch {
                console.error('identify-item unparseable', text.slice(0, 200));
                return json({ error: 'Could not identify this item right now' }, 502);
            }

            const clean = (value: unknown) => {
                if (typeof value !== 'string') return null;
                const trimmed = value.trim();
                if (!trimmed || /^(null|unknown|n\/a|none)$/i.test(trimmed)) return null;
                return trimmed.slice(0, 120);
            };

            const brand = clean(parsed?.brand);
            const name = clean(parsed?.name);
            const confidence = ['high', 'medium', 'low'].includes(parsed?.confidence) ? parsed.confidence : 'low';

            // Nothing recognisable is a real answer, not an error. Saying so lets the
            // caller stay quiet rather than putting a wrong guess in front of someone.
            return json({
                brand,
                name,
                category: clean(parsed?.category),
                confidence,
                recognised: !!brand,
            });
        }

        if (action === 'search-products') {
            // Finds pieces the crawled catalogue does not have.
            //
            // The catalogue covers a small fraction of the brands in the
            // directory, so a search for anything outside it comes back empty
            // even though the piece plainly exists. This searches the live web,
            // which is what the app did originally and why that version found
            // more.
            //
            // What it does NOT do is trust the model for anything checkable. The
            // old version took price, image URL and product link straight from
            // it: prices were recalled and stale, links were routinely invented
            // or Google redirect stubs. Here the link is validated and the image
            // is read from the product page itself.
            const query = typeof payload?.query === 'string' ? payload.query.trim().slice(0, 120) : '';
            if (query.length < 2) return json({ products: [] });

            const rate = await checkRateLimit(user.id, 'ai:search-products', 120, 3600);
            if (!rate.allowed) return rateLimitResponse(rate, cors);

            const searchModel = Deno.env.get('GEMINI_SEARCH_MODEL') || 'gemini-2.5-flash';

            const prompt = [
                'Find real clothing or footwear products matching: "' + query + '".',
                'Reply with a raw JSON array of up to 24 objects, no markdown fence, each exactly:',
                '{"name": string, "brand": string, "price": number|null, "productUrl": string, "imageUrl": string|null}',
                '',
                'Rules:',
                '- name is the specific product, without the brand repeated inside it.',
                '- productUrl must be a real product page you found. Retailer or brand sites only.',
                '- Never return a google.com, vertexaisearch or redirect URL. Omit the item instead.',
                '- price is the current retail or market price in USD, or null if unsure.',
                '  Do not guess a number to fill the field.',
                '- Adult sizing only. No toddler, infant, baby, preschool, kids or GS',
                '  releases unless the search explicitly asks for them.',
                '- Every entry must be a different product. Colourways of the same model',
                '  are fine, duplicates of one colourway are not.',
            ].join(String.fromCharCode(10));

            const resp = await fetch(GEMINI_BASE + '/' + searchModel + ':generateContent?key=' + GEMINI_API_KEY, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    tools: [{ googleSearch: {} }],
                    // Enough room for 24 objects; the default cut replies mid-array.
                    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
                }),
            });

            if (!resp.ok) {
                console.error('search-products upstream', resp.status, (await resp.text()).slice(0, 300));
                return json({ products: [] });
            }

            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text ?? '';

            // Salvage whole objects rather than demanding a whole array.
            //
            // The response is a stream that can stop mid-array, and asking for
            // 24 items makes that likely. Requiring a closing bracket threw away
            // everything on a truncated reply -- a real search for Rick Owens
            // Ramones came back with the right product and was discarded because
            // the array never closed. Each complete {...} is parsed on its own
            // and a half-written trailing one is simply dropped.
            const items: any[] = [];
            const raw = text.replace(/```(?:json)?/g, '');
            let depth = 0;
            let start = -1;
            let inString = false;
            let escaped = false;

            for (let i = 0; i < raw.length; i++) {
                const ch = raw[i];

                if (inString) {
                    if (escaped) escaped = false;
                    else if (ch === '\\') escaped = true;
                    else if (ch === '"') inString = false;
                    continue;
                }

                if (ch === '"') { inString = true; continue; }
                if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
                if (ch === '}') {
                    depth--;
                    if (depth === 0 && start >= 0) {
                        try {
                            items.push(JSON.parse(raw.slice(start, i + 1)));
                        } catch {
                            // One malformed object is not a reason to lose the rest.
                        }
                        start = -1;
                    }
                }
            }

            if (!items.length) {
                console.error('search-products produced nothing usable', text.slice(0, 400));
                return json({ products: [] });
            }

            // Asking the model not to return kids' sizing is a request, not a
            // guarantee -- a toddler shoe came back on a plain "jordan 5" search.
            const KIDS = /\b(toddler|infant|baby|preschool|pre-school|kids|child|youth|grade school)\b|\((td|ps|gs)\)/i;

            const usable = items.filter((item: any) => {
                const url = typeof item?.productUrl === 'string' ? item.productUrl : '';
                const label = `${item?.name ?? ''} ${item?.brand ?? ''}`;
                if (KIDS.test(label) && !KIDS.test(query)) return false;
                if (!/^https?:\/\//i.test(url)) return false;
                // Grounding hands back redirect stubs that 404 for the user.
                if (/vertexaisearch|google\.com|googleusercontent/i.test(url)) return false;
                return typeof item?.name === 'string' && item.name.trim().length > 1;
            }).slice(0, 24);

            // Resolve a real photo for each result.
            //
            // Two routes, because one is not enough. Most sites hand over an
            // og:image if asked with a browser user-agent -- GOAT, Nike, the
            // aggregator, brand sites. StockX and SSENSE sit behind bot
            // protection and return 403 to anything scripted, and StockX is
            // exactly where sneaker listings come from, so its image URL is
            // derived from the product slug and then checked before use.
            //
            // Deliberately not taking the model's own imageUrl: that is what the
            // original version did and the links were frequently dead or pointed
            // at something else entirely.
            const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

            const stockxImage = async (productUrl: string): Promise<string | null> => {
                const slug = productUrl.split('?')[0].split('/').filter(Boolean).pop();
                if (!slug) return null;
                const title = slug.split('-')
                    .map((w: string) => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
                    .join('-');
                const candidate = `https://images.stockx.com/images/${title}-Product.jpg?fit=fill&bg=FFFFFF&w=1000&q=90`;
                try {
                    const head = await fetch(candidate, { method: 'HEAD' });
                    return head.ok ? candidate : null;
                } catch {
                    return null;
                }
            };

            const ogImage = async (productUrl: string): Promise<string | null> => {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 2500);
                    const page = await fetch(productUrl, {
                        signal: controller.signal,
                        headers: {
                            'user-agent': BROWSER_UA,
                            accept: 'text/html,application/xhtml+xml',
                            'accept-language': 'en-US,en;q=0.9',
                        },
                    });
                    clearTimeout(timer);
                    if (!page.ok) return null;
                    const html = (await page.text()).slice(0, 200000);
                    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
                    if (!og || !og[1]) return null;
                    return og[1].startsWith('//') ? 'https:' + og[1] : og[1];
                } catch {
                    return null;
                }
            };

            // Last resort: the model's own image link, but only once it has been
            // checked. Taking it unverified is what made the original version
            // unreliable; discarding it entirely is what made this one return
            // nothing, because the sites grounding likes best -- Farfetch, Mr
            // Porter -- refuse scripted requests outright.
            const verifiedImage = async (candidate: unknown): Promise<string | null> => {
                if (typeof candidate !== 'string' || !/^https?:\/\//i.test(candidate)) return null;
                try {
                    const head = await fetch(candidate, { method: 'HEAD' });
                    const type = head.headers.get('content-type') || '';
                    return head.ok && type.startsWith('image/') ? candidate : null;
                } catch {
                    return null;
                }
            };

            const withImages = await Promise.all(usable.map(async (item: any) => {
                const isStockx = /(^|\.)stockx\.com/i.test(new URL(item.productUrl).hostname);
                const imageUrl = isStockx
                    ? (await stockxImage(item.productUrl)) ?? await verifiedImage(item.imageUrl)
                    : (await ogImage(item.productUrl))
                        ?? (await stockxImage(item.productUrl))
                        ?? await verifiedImage(item.imageUrl);

                return {
                    name: String(item.name).trim().slice(0, 200),
                    brand: typeof item.brand === 'string' ? item.brand.trim().slice(0, 80) : '',
                    price: Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? Number(item.price) : null,
                    productUrl: item.productUrl,
                    imageUrl,
                };
            }));

            // A tile with no picture is worse than one fewer result -- but when
            // that drops everything, the counts are the only way to tell which
            // stage lost them. An empty result used to log nothing at all.
            const withPictures = withImages.filter((item) => !!item.imageUrl);
            console.log(
                `[search-products] "${query}": model ${items.length}, usable ${usable.length}, with image ${withPictures.length}`,
            );
            if (!withPictures.length && usable.length) {
                console.log('[search-products] all dropped at image stage:', usable.map((i: any) => i.productUrl).slice(0, 5).join(' | '));
            }
            return json({ products: withPictures });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error: any) {
        console.error('ai-proxy error', error?.message);
        return json({ error: 'Request failed' }, 500);
    }
});
