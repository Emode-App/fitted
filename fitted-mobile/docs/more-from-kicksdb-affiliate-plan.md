# Plan: Accurate "More from" images via KicksDB + Sovrn affiliate monetization

> Status: APPROVED, not yet implemented (deferred until after pushing current work).
> Saved 2026-06-12.

## Context

Two problems on the post-detail "More from <brand>" sections:

1. **Wrong images** — the cards are populated by `searchProducts` in `services/aiService.ts`, which asks **Gemini to invent a JSON product list**. Gemini hallucinates `imageUrl` (or the code falls back to a fuzzy Bing text-search thumbnail), so the picture often shows a *similar but wrong* product. There is no real product record behind the image.
2. **Income opportunity** — every "Buy" link currently opens the raw merchant URL, earning nothing.

Decisions made with the user:
- **ShopStyle is out** — the platform is shutting down.
- **StockX official API is deferred** — approval takes 1–2 weeks and may be refused; revisit later.
- **Improve KicksDB** for images (the real product API already partially wired up, no new signup for the RapidAPI path).
- **Affiliate = Sovrn Commerce (Skimlinks/VigLink) Redirect API** wrapper on product links.

Why KicksDB fixes the mismatch: each KicksDB record carries `image`, `brand`, `name`, `price`, and `link` **together**, so the image always matches the name/price on the card. Gemini's pipeline had no such guarantee.

KicksDB reality check: ~950k products sourced from **StockX / GOAT / Shopify** — excellent for sneakers/streetwear/hype brands, **thin for mainstream fast-fashion** (Zara, H&M, etc.). The plan handles that gap by *hiding* a brand section when there's no real match rather than showing a wrong image.

---

## Workstream A — Route "More from" to KicksDB (image accuracy)

### A0. Verify/repair the KicksDB integration (do first)
`services/productSearch.ts` targets the RapidAPI proxy `kicks-db.p.rapidapi.com` (`EXPO_PUBLIC_RAPIDAPI_KEY` is set in `.env`). KicksDB's current native API is `https://api.kicks.dev/v3` (Bearer auth). The RapidAPI listing may be stale.
- Test a live query against the existing `searchProducts()`. If it returns real products → keep it.
- If the RapidAPI proxy is deprecated → repoint `productSearch.ts` to `https://api.kicks.dev/v3` using the **unified search** endpoint and a KicksDB key (free tier available). Reference: `https://docs.kicks.dev/recipes/unified-api-search.md`.
- **Capture the product link**: extend `transformResponse()` to populate a `link`/`purchaseLink` field (from `item.link`, `item.urlKey`, or construct `https://stockx.com/{slug}`). The cards need this to be shoppable *and* affiliate-able — the current transform drops it.

### A1. Swap the data source in the post-detail fetch
In `app/post/[id].tsx`, `fetchBrandCollections()` currently imports `searchProducts` from `@/services/aiService`. Change it to import from `@/services/productSearch` and map its `Product` shape → `ClothingItem`:
- `imageUrl`/`thumbnail` → `image_url` (real StockX/GOAT CDN image — the actual fix)
- `name`, `brand`, `retailPrice`/`lastSale` → `name`, `brand`, `price`
- new `link` field → `purchase_link`
- Drop the Bing fallback URL entirely — no more fuzzy text-search images.

Keep the improvements already made in this branch: parallel loading via `Promise.all`, upfront `loadingBrands` so sections don't flash "No items found", and the shared `getDisplayBrands()` helper.

### A2. Honest empty state (handles the apparel gap)
When KicksDB returns no/low-confidence results for a brand (common for non-sneaker labels), **hide that brand section** instead of rendering placeholder/wrong items. Showing fewer correct items beats many wrong ones — this is the core of the user's complaint.
- *Optional, default OFF:* keep Gemini as a last-resort fallback behind a flag. Recommendation: leave off to guarantee accuracy.

### A3. (Optional, recommended) Cache resolved collections
Persist resolved per-brand collections (Supabase table or in-memory store keyed by brand) so repeat post views are instant, consistent, and don't re-bill the API.

---

## Workstream B — Sovrn Commerce affiliate wrapper (income)

The JS auto-wrapper is **web-only**; a native app must use Sovrn's **Redirect API** to convert a merchant URL into an affiliate URL programmatically (per Sovrn's "Mobile and Software Application Onboarding Guide").

### B0. Prerequisite (user action — cannot be automated)
Sign up for **Sovrn Commerce**, get the app approved by their Network Quality team, obtain the **publisher/API key + site ID**. Add as `EXPO_PUBLIC_SOVRN_API_KEY` (+ site id) in `.env`.

### B1. Central helper `services/affiliate.ts`
```
toAffiliateUrl(destUrl: string): string
```
- Wrap with the Sovrn redirect format (template — confirm exact params at developer.sovrn.com):
  `https://redirect.viglink.com/?format=go&key={KEY}&u={encodeURIComponent(destUrl)}&loc={encodeURIComponent('emode://...')}`
- **Graceful no-op**: if no key configured, return `destUrl` unchanged so nothing breaks pre-signup.
- Only wrap **product/merchant** links — never social/website links.

### B2. Apply at product-link open sites only
Route these through `toAffiliateUrl()` before `Linking.openURL`:
- `components/PostItem.tsx` — per-item purchase links (lines ~42, ~66)
- `app/post/[id].tsx` — "More from" item modal buy action
- `app/brand/[id].tsx` — brand product links

**Do NOT** wrap `components/ProfileView.tsx` links (Instagram/TikTok/website) — those aren't merchant links.

---

## Critical files
- `services/productSearch.ts` — verify/repair; add product-link capture
- `app/post/[id].tsx` — swap data source, hide-empty behavior
- `services/affiliate.ts` — **new**, Sovrn redirect helper
- `components/PostItem.tsx`, `app/brand/[id].tsx` — apply affiliate wrapper
- `.env` — `EXPO_PUBLIC_SOVRN_API_KEY` (+ KicksDB key if repointing to native API)

## Out of scope / later
- StockX official Catalog API (revisit after approval, for hype-sneaker exactness)
- Moving API keys server-side via Supabase Edge Function (the `EXPO_PUBLIC_` keys are bundled into the client and extractable — fine for now, harden before scale)

## Verification
1. **Images:** run the app, open a post tagged with sneaker/hype brands (Jordan, Nike, New Balance). Confirm "More from" cards show **matching** images and that name/price/image are consistent; confirm sections load in parallel (no "No items found" flash).
2. **Apparel gap:** open a post with a non-sneaker brand; confirm the section is hidden, not filled with wrong images.
3. **Affiliate:** with a test Sovrn key, tap a Buy link; confirm it routes through `redirect.viglink.com`/Sovrn and lands on the correct merchant page; confirm the click registers in the Sovrn dashboard. With no key, confirm links still open directly (no-op).
