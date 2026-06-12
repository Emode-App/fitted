// Brand logo + trending-brand helpers
// Logos are pulled from logo.dev by guessing the brand's domain from its name.
// This auto-scales as new brands appear in posts — no manual logo upkeep needed.
// Get a free publishable token at https://logo.dev and set EXPO_PUBLIC_LOGODEV_TOKEN.

import { Post } from '@/types';

const LOGODEV_TOKEN = process.env.EXPO_PUBLIC_LOGODEV_TOKEN || '';

// Brand names whose domain isn't a clean "<name>.com". Extend this as you spot
// misses — it's the one spot to nudge logo accuracy as the catalog grows.
const DOMAIN_OVERRIDES: Record<string, string> = {
    'louis vuitton': 'louisvuitton.com',
    'off-white': 'off---white.com',
    'off white': 'off---white.com',
    'saint laurent': 'ysl.com',
    'ysl': 'ysl.com',
    'yves saint laurent': 'ysl.com',
    'dior': 'dior.com',
    'comme des garcons': 'comme-des-garcons.com',
    'a bathing ape': 'bape.com',
    'bape': 'bape.com',
    'new balance': 'newbalance.com',
    'the north face': 'thenorthface.com',
    'north face': 'thenorthface.com',
    'ralph lauren': 'ralphlauren.com',
    'polo ralph lauren': 'ralphlauren.com',
    'tommy hilfiger': 'tommy.com',
    'calvin klein': 'calvinklein.com',
    'fear of god': 'fearofgod.com',
    'essentials': 'fearofgod.com',
    'palm angels': 'palmangels.com',
    'stone island': 'stoneisland.com',
    'true religion': 'truereligion.com',
    'urban outfitters': 'urbanoutfitters.com',
};

// Normalize a brand name into a best-guess domain (e.g. "Nike" -> "nike.com").
const guessDomain = (brand: string): string => {
    const key = brand.trim().toLowerCase();
    if (DOMAIN_OVERRIDES[key]) return DOMAIN_OVERRIDES[key];

    const slug = key
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip accents (Stüssy -> Stussy)
        .replace(/[^a-z0-9]/g, ''); // drop spaces/punctuation

    return slug ? `${slug}.com` : '';
};

// Public URL for a brand's logo. Returns null when we can't form a domain.
export const getBrandLogoUrl = (brand: string): string | null => {
    const domain = guessDomain(brand);
    if (!domain) return null;

    const params = new URLSearchParams({ size: '200', format: 'png' });
    if (LOGODEV_TOKEN) params.set('token', LOGODEV_TOKEN);
    return `https://img.logo.dev/${domain}?${params.toString()}`;
};

export interface TrendingBrand {
    name: string; // display name (original casing)
    fitCount: number; // number of fits featuring this brand
    likes: number; // total likes across those fits (tiebreaker)
    logoUrl: string | null;
}

// Rank brands by how many fits feature them (each fit counts a brand once),
// breaking ties by total likes. Returns the top `limit` brands.
export const computeTrendingBrands = (posts: Post[], limit = 4): TrendingBrand[] => {
    const map = new Map<string, { name: string; fitCount: number; likes: number }>();

    for (const post of posts) {
        if (!Array.isArray(post.items)) continue;

        // Unique, valid brand names within this single fit
        const brandsInFit = new Set<string>();
        for (const item of post.items) {
            const raw = item?.brand?.trim();
            if (!raw || raw.toLowerCase() === 'unknown') continue;
            brandsInFit.add(raw);
        }

        for (const brand of brandsInFit) {
            const key = brand.toLowerCase();
            const existing = map.get(key);
            if (existing) {
                existing.fitCount += 1;
                existing.likes += post.likes_count || 0;
            } else {
                map.set(key, { name: brand, fitCount: 1, likes: post.likes_count || 0 });
            }
        }
    }

    return Array.from(map.values())
        .sort((a, b) => b.fitCount - a.fitCount || b.likes - a.likes)
        .slice(0, limit)
        .map((b) => ({ ...b, logoUrl: getBrandLogoUrl(b.name) }));
};
