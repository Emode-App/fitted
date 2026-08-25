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
                'Reply with a raw JSON array of up to 30 objects, no markdown fence, each exactly:',
                '{"name": string, "brand": string, "price": number|null, "productUrl": string, "imageUrl": string|null}',
                '',
                'Rules:',
                '- Find as many as you can. More is better: somebody is picking one',
                '  piece out of a grid, and a short list gives them nothing to choose',
                '  between. Do not stop at a handful.',
                '- What to leave out is one person selling their own pair --',
                '  "Lightning Jordan Retro 4s Size 10.5 New Never Worn", "size 6.5y" --',
                '  photographed at home and titled with their size and condition.',
                '- A shop is not that. Retailer and marketplace product pages are exactly',
                '  what you want, StockX and Grailed included: they carry proper',
                '  photography and they publish a price.',
                '- Strongly prefer a page that shows a price over one that does not. A',
                '  result with no price is close to useless here, so if the brand site',
                '  hides it and a stockist shows it, return the stockist.',
                '- price is that number in USD, read off the page you actually found.',
                '  You are searching live, so do not recall one from memory. null only',
                '  when the page genuinely shows none.',
                '- name is the full product name as the page writes it, including the',
                '  model line, so it reads properly on its own: "Air Jordan 4 Retro',
                '  Lightning", not "4 Retro Lightning". No size, condition or seller',
                '  wording, and no style or SKU code.',
                '- Several entries for one release are wanted, not avoided -- each brings',
                '  a different photograph and that is the point. Name the retro year when',
                '  releases differ: a 2006 Lightning and a 2021 Lightning are not the',
                '  same shoe.',
                '- Prefer stockx.com, goat.com, grailed.com, ssense.com, farfetch.com,',
                '  lyst.com, nike.com or the brand site itself. This list was once in',
                '  these rules and was dropped, and the results immediately came back',
                '  from tiny boutiques instead: stock photographed on a floor, no price',
                '  anywhere on the page, and sometimes a search listing rather than a',
                '  product. Those sites are what make a result look official, so ask',
                '  them first. Other retailers only when these genuinely do not carry it.',
                '- productUrl must be a real product page you found -- one specific item.',
                '  Never a search results page, a category, a collection index or a',
                '  department listing. If the only thing you can find is a search URL',
                '  with the query in it, leave the item out.',
                '- Never return a google.com, vertexaisearch or redirect URL. Omit the item instead.',
                '- Adult sizing only. No toddler, infant, baby, preschool, kids or GS',
                '  releases unless the search explicitly asks for them.',
            ].join(String.fromCharCode(10));

            // One ask is one roll of the dice.
            //
            // "lightning jordan 4" came back with a single object while the same
            // code answered "rick owens ramones" with thirty. Nothing filtered
            // it -- the model simply returned one, and a grounded model does
            // that sometimes. A single thin reply should not empty the screen,
            // so a poor first answer is asked again and the two are merged.
            const askModel = async (): Promise<any[]> => {
                const resp = await fetch(GEMINI_BASE + '/' + searchModel + ':generateContent?key=' + GEMINI_API_KEY, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        tools: [{ googleSearch: {} }],
                        generationConfig: {
                            // Thirty objects plus the preamble grounding likes to
                            // write. This model thinks by default and those tokens
                            // come out of the same budget, which truncated the
                            // array after a single object -- the logs read
                            // "model 1" on search after search.
                            temperature: 0.4,
                            maxOutputTokens: 16384,
                            thinkingConfig: { thinkingBudget: 0 },
                        },
                    }),
                });

                if (!resp.ok) {
                    console.error('search-products upstream', resp.status, (await resp.text()).slice(0, 300));
                    return [];
                }

                const data = await resp.json();
                const text = data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text ?? '';
                const finish = data?.candidates?.[0]?.finishReason ?? '';

                // Salvage whole objects rather than demanding a whole array.
                //
                // The response is a stream that can stop mid-array, and asking
                // for thirty items makes that likely. Requiring a closing
                // bracket threw away everything on a truncated reply -- a real
                // search for Rick Owens Ramones came back with the right product
                // and was discarded because the array never closed. Each
                // complete {...} is parsed on its own and a half-written
                // trailing one is simply dropped.
                const found: any[] = [];
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
                                found.push(JSON.parse(raw.slice(start, i + 1)));
                            } catch {
                                // One malformed object is not a reason to lose the rest.
                            }
                            start = -1;
                        }
                    }
                }

                // When the yield is thin, say why it was thin. "model 1" on its
                // own gave no way to tell a short answer from a cut-off one.
                if (found.length < 8) {
                    console.log(`[search-products] thin reply: ${found.length} objects, ${raw.length} chars, finish ${finish}`);
                }
                return found;
            };

            let items = await askModel();

            if (items.length < 8) {
                const second = await askModel();
                const byUrl = new Map<string, any>();
                for (const item of [...items, ...second]) {
                    const key = String(item?.productUrl ?? '').trim();
                    if (key && !byUrl.has(key)) byUrl.set(key, item);
                }
                console.log(`[search-products] retried: ${items.length} + ${second.length} -> ${byUrl.size}`);
                items = [...byUrl.values()];
            }

            if (!items.length) {
                console.error('search-products produced nothing usable', text.slice(0, 400));
                return json({ products: [] });
            }

            // Asking the model not to return kids' sizing is a request, not a
            // guarantee -- a toddler shoe came back on a plain "jordan 5" search.
            const KIDS = /\b(toddler|infant|baby|preschool|pre-school|kids|child|youth|grade school)\b|\((td|ps|gs)\)/i;

            // Grounding sometimes answers with its own redirect stubs instead of
            // the page it found. Those were being discarded, and when a whole
            // batch came back that way the search reported nothing -- one run
            // logged "model 24, usable 0" while the identical query four minutes
            // earlier had returned 16 real listings. The stub resolves to the
            // real URL, so follow it rather than throwing the result away.
            // Every stub resolves at once through Promise.all, so a slow moment
            // at Google times them out together: one run of "rick owens ramones"
            // lost 10 of 11 results this way while the next lost 2 of 18. Same
            // query, same code -- the only difference was how fast the hops
            // came back, which is not a thing a result should depend on.
            //
            // HEAD is enough to learn where a redirect lands and avoids pulling
            // the whole page down, and a slow hop now gets a second chance on
            // GET rather than being read as a dead link.
            const hopTo = async (url: string, method: string, ms: number): Promise<string> => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), ms);
                try {
                    const hop = await fetch(url, { method, redirect: 'follow', signal: controller.signal });
                    return hop.url || '';
                } finally {
                    clearTimeout(timer);
                }
            };

            const isStub = (url: string) => /vertexaisearch|google\.com|googleusercontent/i.test(url);

            const resolveRedirect = async (url: string): Promise<string | null> => {
                for (const [method, ms] of [['HEAD', 6000], ['GET', 9000]] as const) {
                    try {
                        const final = await hopTo(url, method, ms);
                        if (final && !isStub(final)) return final;
                    } catch {
                        // Try the next shape before calling it dead.
                    }
                }
                return null;
            };

            // A search results page is not a product.
            //
            // "Rick Owens Mainline Leather Ramones" came back pointing at
            // ebay.com/sch/i.html?_nkw=Mainline+Rick+Owens&_udlo=400 -- an eBay
            // search with a price range on it. That one URL explains a whole
            // screen: a results page has no price to read, so the tile says
            // "See price"; it has no product image, so the picture falls
            // through to a guess; and the same page answers many queries, so it
            // comes back as several identical tiles. Worse, it was being
            // written to the catalogue, where it would have stayed.
            const PRODUCT_PATH = /\/(products?|itm|item|listings?|dp|pd|prod)\//i;
            const INDEX_PATH = /\/(sch|search|browse|category|categories|collections|designers?|tag|tags)(\/|$)/i;
            const SEARCH_QUERY = /[?&](_nkw|q|query|keyword|keywords|search|searchterm|term)=/i;
            const CATEGORY_LEAF = /^(shoes|sneakers|trainers|boots|footwear|clothing|clothes|apparel|bags|accessories|men|women|mens|womens|man|woman|kids|sale|new|new-arrivals|all|shop|store|home|index)$/i;

            const isProductPage = (url: string): boolean => {
                try {
                    const parsed = new URL(url);
                    const path = parsed.pathname;
                    // An explicit product path settles it -- Shopify sites put
                    // /products/ under /collections/ and those are real pages.
                    if (PRODUCT_PATH.test(path)) return true;
                    if (INDEX_PATH.test(path)) return false;
                    // A brand's own listing page ends in the department:
                    // rickowens.eu/en/US/men/shoes. A product slug ends in
                    // something that identifies one piece, never in a bare
                    // word for a whole department.
                    const leaf = path.replace(/\/+$/, '').split('/').pop() ?? '';
                    if (CATEGORY_LEAF.test(leaf)) return false;
                    if (SEARCH_QUERY.test(parsed.search)) return false;
                    return true;
                } catch {
                    return false;
                }
            };

            // Resolve a few at a time, not all thirty at once.
            //
            // Promise.all fires every redirect simultaneously, and Google
            // answers a burst like that by making most of them wait: one run
            // lost 10 of 21 results, the next 5 of 19, all of them stubs that
            // simply ran out of time. Nothing was wrong with those products --
            // they were dropped for arriving late to a queue we created.
            //
            // Six at a time is slower per batch and finishes with far more of
            // them intact, which is the trade that matters when every loss is
            // a shoe missing from the grid.
            const mapWithLimit = async <T, R>(list: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
                const out = new Array<R>(list.length);
                let next = 0;
                const worker = async () => {
                    while (true) {
                        const index = next++;
                        if (index >= list.length) return;
                        out[index] = await fn(list[index]);
                    }
                };
                await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
                return out;
            };

            const resolved = await mapWithLimit(items, 6, (async (item: any) => {
                const url = typeof item?.productUrl === 'string' ? item.productUrl : '';
                if (!/^https?:\/\//i.test(url)) return null;
                if (typeof item?.name !== 'string' || item.name.trim().length < 2) return null;

                const label = `${item?.name ?? ''} ${item?.brand ?? ''}`;
                if (KIDS.test(label) && !KIDS.test(query)) return null;

                if (/vertexaisearch|google\.com|googleusercontent/i.test(url)) {
                    const direct = await resolveRedirect(url);
                    if (!direct) return null;
                    if (!isProductPage(direct)) return null;
                    return { ...item, productUrl: direct };
                }
                if (!isProductPage(url)) return null;
                return item;
            }) as (item: any) => Promise<any>);

            // A resale listing is one person selling one pair: their photo, their
            // asking price, their sizing in the title. Those are what made the
            // Lightning 4 results look like a car boot sale, and they are also
            // the entries that arrive with no price, because there is no product
            // page behind them to read one off.
            const RESALE = new RegExp(
                [
                    'size\\s*\\d',
                    '\\b\\d+(\\.\\d)?y\\b',
                    '\\bus\\s*\\d',
                    '\\b(new|never)\\s+(never\\s+)?worn\\b',
                    '\\b(vnds|dswt|deadstock|preowned|pre-owned|used|worn once)\\b',
                    '\\bno box\\b',
                    '\\b(bid|auction|offer)\\b',
                ].join('|'),
                'i',
            );

            // Several entries for one release are wanted, not a problem: they come
            // with different photographs, and picking the angle that suits the
            // board is the point. So no de-duplication by name -- only the
            // requirement that each one reads like a product rather than someone
            // clearing out their wardrobe.
            const found = resolved.filter(Boolean) as any[];
            const clean = found.filter((item) => !RESALE.test(String(item.name)));

            // A filter that empties a good query is worse than the listings it
            // was meant to remove: the grid goes blank and the search reads as
            // broken. One run turned 24 results into none. So the tidier list
            // is used when it has something in it, and the raw one otherwise --
            // scruffy results beat no results.
            const usable = (clean.length > 0 ? clean : found)
                // A listing with a price came from a product page. Those first.
                .sort((a, b) => (Number(b?.price) > 0 ? 1 : 0) - (Number(a?.price) > 0 ? 1 : 0))
                .slice(0, 30);


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

            // Last line of defence, and the one the original version used.
            //
            // Every other route can fail for reasons outside our control: the
            // retailer blocks scripted requests, the slug does not reconstruct,
            // the model invents a CDN hostname. This one is a direct image
            // endpoint keyed on text, so it always answers -- which is why the
            // December build showed dozens of results where this was showing
            // none. The picture is a search thumbnail rather than the retailer's
            // own shot, so it is only reached once the better routes have failed,
            // and the item sheet carries a report control for when it is wrong.
            // Last resort when the retailer will not hand over a picture.
            //
            // This was removed once on the theory that it was the source of the
            // scruffy photographs in the grid. It was not: those came from the
            // boutiques' own og:images -- small shops photograph stock on a
            // floor -- and a thumbnail search mostly returns the clean pack
            // shot, because it indexes the same retailers. Taking it out left
            // three tiles in four empty. It stays.
            //
            // No height parameter, though. Asking this endpoint for a width and
            // a height crops to fill rather than fitting, which is where the
            // extreme close-ups of laces came from; width alone returns the
            // picture at its own proportions.
            const searchThumbnail = (brand: string, name: string): string => {
                // "Rick Owens" + "Rick Owens Mainline Leather Ramones" searched
                // the brand twice and matched worse for it.
                const alreadyNamed = brand && name.toLowerCase().startsWith(brand.toLowerCase());
                const q = encodeURIComponent((alreadyNamed ? name : `${brand} ${name}`).trim().slice(0, 120));
                return `https://tse1.mm.bing.net/th?q=${q}&w=600`;
            };

            const withImages = await Promise.all(usable.map(async (item: any) => {
            // Style codes are for a warehouse, not a person. Names arrive as
            // "Air Jordan 4 Retro Lightning CT8527-700" or "LW1234 Puzzle Bag",
            // and the code reads as noise next to every clean name beside it.
            // clean_item_name() already strips the leading form for catalogue
            // rows; this is the same idea for what the web returns, in both
            // positions.
            //
            // A retro year is not a style code. "[2021]" is exactly the
            // disambiguation the prompt asks for, so the shapes below all
            // require either a letter prefix or a dashed serial -- four bare
            // digits never match, and neither do model numbers like 9060,
            // Boost 350 or Air Max 97.
            const STYLE_CODE = /^(?:[A-Z]{1,3}[0-9]{3,}(?:[-\/][0-9A-Z]{2,4})?|[0-9]{5,6}-[0-9]{2,3})$/;
            const isCode = (word: string) => STYLE_CODE.test(word.replace(/[.,]+$/, '').toUpperCase());
            const wordy = (words: string[]) => words.filter((w) => /[A-Za-z]{3,}/.test(w)).length;

            const stripStyleCode = (raw: string): string => {
                // Bracketed only when the brackets hold a code -- (CT8527-700)
                // goes, [2021] stays.
                const unbracketed = raw.replace(
                    /[(\[{]\s*([^)\]}]{2,24})\s*[)\]}]/g,
                    (match, inner) => (isCode(String(inner).trim()) ? ' ' : match),
                );

                const words = unbracketed.split(/\s+/).filter(Boolean);
                // Never strip down to a bare brand: the remainder has to stand
                // on its own as a name, which means two words and at least one
                // real one. "Samba OG IE3438" loses the code; "Jordan CT8527"
                // keeps it, because "Jordan" alone says less than both did.
                const trimmable = (rest: string[]) => rest.length >= 2 && wordy(rest) >= 1;
                while (words.length > 1 && isCode(words[words.length - 1]) && trimmable(words.slice(0, -1))) words.pop();
                while (words.length > 1 && isCode(words[0]) && trimmable(words.slice(1))) words.shift();

                return words.join(' ').trim() || raw;
            };

                const isStockx = /(^|\.)stockx\.com/i.test(new URL(item.productUrl).hostname);
                const brand = typeof item.brand === 'string' ? item.brand.trim() : '';
                // StockX files this shoe as brand "Jordan", name "4 Retro
                // Lightning", and a name beginning with a bare model number
                // reads as a mistake once the brand sits in its own line above
                // it. Putting the brand back makes the name stand on its own,
                // which is how every product page writes it.
                const bare = String(item.name).trim();
                const startsWithNumber = /^[0-9]/.test(bare);
                const namesBrand = brand.length > 0 &&
                    bare.toLowerCase().includes(brand.toLowerCase().split(/\s+/)[0]);
                const name = startsWithNumber && brand && !namesBrand ? `${brand} ${bare}` : bare;

                const resolved = isStockx
                    ? (await stockxImage(item.productUrl)) ?? await verifiedImage(item.imageUrl)
                    : (await ogImage(item.productUrl))
                        ?? (await stockxImage(item.productUrl))
                        ?? await verifiedImage(item.imageUrl);

                const imageUrl = resolved ?? searchThumbnail(brand, name);

                return {
                    name: stripStyleCode(name).slice(0, 200),
                    brand: brand.slice(0, 80),
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
                '[search-products] "' + query + '": model ' + items.length +
                    ', kept ' + clean.length + '/' + found.length +
                    (clean.length ? '' : ' (resale filter emptied it, fell back)') +
                    ', usable ' + usable.length + ', with image ' + withPictures.length,
            );
            // Say what the filter took, not just how many survived. "usable 0"
            // on its own gave no clue that a whole batch had arrived as
            // redirect stubs.
            if (usable.length < items.length) {
                console.log(
                    `[search-products] filtered ${items.length - usable.length}:`,
                    items
                        .filter((item: any) => !usable.some((u: any) => u.name === item.name))
                        .map((item: any) => String(item?.productUrl ?? '(no url)').slice(0, 90))
                        .slice(0, 5)
                        .join(' | '),
                );
            }
            // A tile can arrive with a URL and still show blank, because the
            // host serves this function happily and refuses the phone. Without
            // the host in the log there is no way to tell which one did it.
            const hostsOf = (list: any[]) => Array.from(new Set(list
                .map((i: any) => { try { return new URL(String(i.imageUrl)).hostname; } catch { return '?'; } })));
            if (withPictures.length) {
                console.log('[search-products] image hosts:', hostsOf(withPictures).join(', '));
            }
            if (!withPictures.length && usable.length) {
                console.log('[search-products] all dropped at image stage:', usable.map((i: any) => i.productUrl).slice(0, 5).join(' | '));
            }
            // Keep what this search verified.
            //
            // Every search asked the model from scratch, and a grounded model
            // does not answer the same way twice -- "Leather Ramones Sneakers,
            // $548" appeared in one search and was missing from the next. There
            // was nothing wrong with the entry; it had never been written down,
            // so there was nowhere for it to come back from.
            //
            // Recording them makes the catalogue accumulate instead of
            // rerolling: the next search for these words answers from the
            // indexed table straight away, and the web pass behind it adds
            // whatever it finds that is new.
            // Only what was actually verified goes in the catalogue.
            //
            // A thumbnail-search picture is a reasonable thing to show right now
            // and a poor thing to keep: it is a guess about which photograph
            // belongs to this product, and writing it down makes the guess
            // permanent and reuses it for everyone. Rows are recorded with the
            // retailer's own image or not at all.
            const verified = withPictures.filter((item) => !/bing\.net/i.test(String(item.imageUrl)));
            if (verified.length) {
                const { data: written, error: writeError } = await admin
                    .rpc('record_web_products', { items: verified });
                if (writeError) {
                    // A search that found results is still a good search. This
                    // is a cache, so failing to fill it must not fail the reply.
                    console.warn('[search-products] could not record results:', writeError.message);
                } else {
                    console.log(`[search-products] recorded ${written} to catalogue`);
                }
            }

            return json({ products: withPictures });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error: any) {
        console.error('ai-proxy error', error?.message);
        return json({ error: 'Request failed' }, 500);
    }
});
