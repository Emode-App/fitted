// Product Search Service - Uses RapidAPI KicksDB for sneaker data
// API Docs: https://rapidapi.com/kicks-db-kicks-db-default/api/kicks-db

const RAPIDAPI_HOST = 'kicks-db.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.EXPO_PUBLIC_RAPIDAPI_KEY || '';

export interface Product {
    id: string;
    name: string;
    brand: string;
    imageUrl: string;
    thumbnail: string;
    styleId: string;
    retailPrice?: number;
    lastSale?: number;
}

export interface SearchResult {
    products: Product[];
    total: number;
}

/**
 * Search for sneakers/products using KicksDB API
 */
export async function searchProducts(query: string, limit: number = 20): Promise<SearchResult> {
    if (!query.trim()) {
        return { products: [], total: 0 };
    }

    if (!RAPIDAPI_KEY) {
        console.warn('RAPIDAPI_KEY not set - using mock data');
        return getMockResults(query);
    }

    try {
        // KicksDB uses /search/multi endpoint with 'keyword' parameter
        const response = await fetch(
            `https://${RAPIDAPI_HOST}/search/multi?keyword=${encodeURIComponent(query)}&limit=${limit}`,
            {
                method: 'GET',
                headers: {
                    'X-RapidAPI-Key': RAPIDAPI_KEY,
                    'X-RapidAPI-Host': RAPIDAPI_HOST,
                },
            }
        );

        if (!response.ok) {
            // If /search/multi fails, try alternate endpoint
            console.log('Trying alternate search endpoint...');
            const altResponse = await fetch(
                `https://${RAPIDAPI_HOST}/stockx/search?query=${encodeURIComponent(query)}&count=${limit}`,
                {
                    method: 'GET',
                    headers: {
                        'X-RapidAPI-Key': RAPIDAPI_KEY,
                        'X-RapidAPI-Host': RAPIDAPI_HOST,
                    },
                }
            );

            if (!altResponse.ok) {
                throw new Error(`API error: ${altResponse.status}`);
            }

            const altData = await altResponse.json();
            return transformResponse(altData);
        }

        const data = await response.json();
        return transformResponse(data);
    } catch (error) {
        console.error('Product search error:', error);
        // Return mock data on error for development
        return getMockResults(query);
    }
}

/**
 * Transform API response to our Product interface
 */
function transformResponse(data: any): SearchResult {
    // Handle various response formats from KicksDB
    const items = data.hits || data.results || data.Products || data.data || [];

    const products: Product[] = items.map((item: any) => ({
        id: item.objectID || item.id || item.styleId || item.urlKey || Math.random().toString(),
        name: item.name || item.title || item.productName || 'Unknown Product',
        brand: item.brand || item.brandName || 'Unknown Brand',
        imageUrl: item.image?.original || item.thumbnailUrl || item.media?.imageUrl || item.imageUrl || item.thumbnail || '',
        thumbnail: item.image?.small || item.thumbnailUrl || item.media?.thumbUrl || item.thumbnail || item.imageUrl || '',
        styleId: item.styleId || item.sku || item.style_id || '',
        retailPrice: item.retailPrice || item.price || item.retail_price,
        lastSale: item.lastSale || item.market?.lastSale || item.lowestAsk,
    }));

    return {
        products,
        total: data.total || data.nbHits || data.count || products.length,
    };
}

/**
 * Mock results for development/demo purposes
 */
function getMockResults(query: string): SearchResult {
    const mockProducts: Product[] = [
        {
            id: '1',
            name: 'Air Jordan 1 Retro High OG',
            brand: 'Jordan',
            imageUrl: 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Chicago-Lost-and-Found.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            thumbnail: 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Chicago-Lost-and-Found.jpg?fit=fill&bg=FFFFFF&w=200&h=150&auto=format,compress&q=90',
            styleId: 'DZ5485-612',
            retailPrice: 180,
            lastSale: 245,
        },
        {
            id: '2',
            name: 'Nike Dunk Low Panda',
            brand: 'Nike',
            imageUrl: 'https://images.stockx.com/images/Nike-Dunk-Low-Retro-White-Black-2021.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            thumbnail: 'https://images.stockx.com/images/Nike-Dunk-Low-Retro-White-Black-2021.jpg?fit=fill&bg=FFFFFF&w=200&h=150&auto=format,compress&q=90',
            styleId: 'DD1391-100',
            retailPrice: 110,
            lastSale: 95,
        },
        {
            id: '3',
            name: 'Yeezy Boost 350 V2 Zebra',
            brand: 'adidas',
            imageUrl: 'https://images.stockx.com/images/adidas-Yeezy-Boost-350-V2-Zebra-2022.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            thumbnail: 'https://images.stockx.com/images/adidas-Yeezy-Boost-350-V2-Zebra-2022.jpg?fit=fill&bg=FFFFFF&w=200&h=150&auto=format,compress&q=90',
            styleId: 'GW0266',
            retailPrice: 230,
            lastSale: 265,
        },
        {
            id: '4',
            name: 'New Balance 550 White Green',
            brand: 'New Balance',
            imageUrl: 'https://images.stockx.com/images/New-Balance-550-White-Green.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
            thumbnail: 'https://images.stockx.com/images/New-Balance-550-White-Green.jpg?fit=fill&bg=FFFFFF&w=200&h=150&auto=format,compress&q=90',
            styleId: 'BB550WT1',
            retailPrice: 110,
            lastSale: 125,
        },
    ].filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.brand.toLowerCase().includes(query.toLowerCase())
    );

    // If no matches, return all mock data
    return {
        products: mockProducts.length > 0 ? mockProducts : [
            {
                id: 'mock-1',
                name: `${query} Sneaker`,
                brand: 'Nike',
                imageUrl: 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Chicago-Lost-and-Found.jpg?fit=fill&bg=FFFFFF&w=700&h=500&auto=format,compress&q=90',
                thumbnail: 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Chicago-Lost-and-Found.jpg?fit=fill&bg=FFFFFF&w=200&h=150&auto=format,compress&q=90',
                styleId: 'MOCK-001',
                retailPrice: 150,
            },
        ],
        total: mockProducts.length || 1,
    };
}
