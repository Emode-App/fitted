// AI Service - calls the authenticated `ai-proxy` edge function so the Gemini
// API key stays server-side and never ships in the app bundle.

import { supabase } from './supabase';

/**
 * Generates a realistic outfit image via the ai-proxy edge function
 * (Gemini 3 Pro Image / Nano Banana). Returns a data: URL.
 */
export async function generateOutfit(
    facePhotoBase64: string | null,
    clothingImagesBase64: string[],
    backgroundPrompt?: string
): Promise<string> {
    if (clothingImagesBase64.length === 0) {
        throw new Error('At least one clothing item is required');
    }

    try {
        const { data, error } = await supabase.functions.invoke('ai-proxy', {
            body: {
                action: 'generate-outfit',
                facePhotoBase64,
                clothingImagesBase64,
                backgroundPrompt,
            },
        });

        if (error) throw new Error(error.message || 'Outfit generation failed');
        if (!data?.image) throw new Error(data?.error || 'No image generated in response.');
        return data.image as string;
    } catch (error) {
        console.error('Outfit generation error:', error);
        throw error;
    }
}

export interface Product {
    id: string;
    name: string;
    brand: string;
    price: number;
    sku?: string;
    imageUrl?: string;
    purchaseLink: string;
}

/**
 * Searches for products via the ai-proxy edge function (Gemini server-side).
 * Falls back to mock data on any failure.
 */
export async function searchProducts(query: string): Promise<Product[]> {
    if (!query.trim()) {
        return [];
    }

    try {
        const { data, error } = await supabase.functions.invoke('ai-proxy', {
            body: { action: 'search-products', query },
        });

        if (error) {
            console.error('Search error:', error.message);
            return getMockResults(query);
        }

        const items = data?.products;
        if (!Array.isArray(items)) {
            return getMockResults(query);
        }

        return items.map((item: any, index: number) => {
            let link = item.purchaseLink;

            // Sanitizer: filter out garbage links the model sometimes returns.
            if (typeof link !== 'string' || link.includes('vertexaisearch') || link.includes('google.com')) {
                link = `https://stockx.com/search?s=${encodeURIComponent(item.name || query)}`;
            }

            return {
                id: item.sku || `product-${index}`,
                name: item.name || 'Unknown Product',
                brand: item.brand || 'Unknown Brand',
                price: item.price || 0,
                sku: item.sku,
                imageUrl: item.imageUrl,
                purchaseLink: link,
            };
        });
    } catch (error) {
        console.error('Search error:', error);
        return getMockResults(query);
    }
}

/**
 * Mock results for development/demo purposes
 */
function getMockResults(query: string): Product[] {
    const mockProducts: Product[] = [
        {
            id: '1',
            name: 'Air Jordan 1 Retro High OG Chicago',
            brand: 'Jordan',
            price: 180,
            sku: 'DZ5485-612',
            imageUrl: 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Chicago-Lost-and-Found.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            purchaseLink: 'https://stockx.com/air-jordan-1-retro-high-og-chicago-lost-and-found',
        },
        {
            id: '2',
            name: 'Nike Dunk Low Retro White Black Panda',
            brand: 'Nike',
            price: 110,
            sku: 'DD1391-100',
            imageUrl: 'https://images.stockx.com/images/Nike-Dunk-Low-Retro-White-Black-2021.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            purchaseLink: 'https://stockx.com/nike-dunk-low-retro-white-black-panda',
        },
        {
            id: '3',
            name: 'Yeezy Boost 350 V2 Zebra',
            brand: 'adidas',
            price: 230,
            sku: 'GW0266',
            imageUrl: 'https://images.stockx.com/images/adidas-Yeezy-Boost-350-V2-Zebra-2022.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            purchaseLink: 'https://stockx.com/adidas-yeezy-boost-350-v2-zebra-2022',
        },
        {
            id: '4',
            name: 'New Balance 550 White Green',
            brand: 'New Balance',
            price: 110,
            sku: 'BB550WT1',
            imageUrl: 'https://images.stockx.com/images/New-Balance-550-White-Green.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            purchaseLink: 'https://stockx.com/new-balance-550-white-green',
        },
        {
            id: '5',
            name: 'Nike Air Force 1 Low White',
            brand: 'Nike',
            price: 100,
            sku: 'CW2288-111',
            imageUrl: 'https://images.stockx.com/images/Nike-Air-Force-1-Low-White-07.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            purchaseLink: 'https://stockx.com/nike-air-force-1-low-white-07',
        },
        {
            id: '6',
            name: 'Jordan 4 Retro Military Black',
            brand: 'Jordan',
            price: 210,
            sku: 'DH6927-111',
            imageUrl: 'https://images.stockx.com/images/Air-Jordan-4-Retro-Military-Black.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            purchaseLink: 'https://stockx.com/air-jordan-4-retro-military-black',
        },
        {
            id: '7',
            name: 'Nike SB Dunk Low Travis Scott',
            brand: 'Nike',
            price: 1200,
            sku: 'CT5053-001',
            imageUrl: 'https://images.stockx.com/images/Nike-SB-Dunk-Low-Travis-Scott.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            purchaseLink: 'https://stockx.com/nike-sb-dunk-low-travis-scott',
        },
        {
            id: '8',
            name: 'adidas Samba OG White Black',
            brand: 'adidas',
            price: 100,
            sku: 'B75806',
            imageUrl: 'https://images.stockx.com/images/adidas-Samba-OG-White-Black.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            purchaseLink: 'https://stockx.com/adidas-samba-og-white-black',
        },
    ];

    // Filter by query
    const filtered = mockProducts.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.brand.toLowerCase().includes(query.toLowerCase())
    );

    return filtered.length > 0 ? filtered : mockProducts.slice(0, 4);
}
