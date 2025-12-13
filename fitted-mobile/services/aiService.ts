// AI Service - Uses Gemini for product search and outfit generation
// Ported from Vite codebase

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini with API key from environment
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

// New SDK for image generation (Gemini 3 Pro / Nano Banana)
const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

/**
 * Generates a realistic outfit image using Gemini 3 Pro Image Preview (Nano Banana).
 * Takes a face photo and clothing items, returns a generated outfit image.
 */
export async function generateOutfit(
    facePhotoBase64: string | null,
    clothingImagesBase64: string[],
    backgroundPrompt?: string
): Promise<string> {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    if (clothingImagesBase64.length === 0) {
        throw new Error('At least one clothing item is required');
    }

    try {
        const parts: any[] = [];

        // 1. Context Prompt
        parts.push({
            text: `Generate a hyper-realistic, high-fashion photo of a person wearing the clothing items provided below.
                   The style should be modern and trendy. 
                   The fit of the clothes should differ to the specific item type (e.g. baggy pants should look baggy).
                   The background should be: ${backgroundPrompt || "a clean, neutral studio background"}.
                   Output a single 1:1 aspect ratio image.`
        });

        // 2. Add Face Reference
        if (facePhotoBase64) {
            const cleanFace = facePhotoBase64.split(',')[1] || facePhotoBase64;
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: cleanFace
                }
            });
            parts.push({ text: "Preserve the facial identity of this person in the generated image." });
        }

        // 3. Add Clothing Items
        clothingImagesBase64.forEach((img, index) => {
            const cleanImg = img.split(',')[1] || img;
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanImg
                }
            });
            parts.push({ text: `Wear this clothing item (${index + 1}).` });
        });

        // 4. Call Model
        const response = await genAI.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                responseModalities: ['IMAGE', 'TEXT'],
            }
        });

        // 5. Extract Result
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
        }

        throw new Error("No image generated in response.");

    } catch (error) {
        console.error("Outfit generation error:", error);
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
 * Searches for products using Gemini with Google Search Grounding.
 * Simulates a Product API by extracting structured data from search results.
 */
export async function searchProducts(query: string): Promise<Product[]> {
    if (!query.trim()) {
        return [];
    }

    if (!GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY not set - using mock data');
        return getMockResults(query);
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            // Note: Google Search grounding requires specific API configuration
        });

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
3. If you can't find a direct link, construct a valid StockX URL using the product name (e.g. https://stockx.com/product-slug).

Do not include markdown formatting or backticks. Just the raw JSON string.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text() || '';

        // Clean up markdown if present despite instructions
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const items = JSON.parse(cleanText);

            if (Array.isArray(items)) {
                return items.map((item: any, index: number) => {
                    let link = item.purchaseLink;

                    // Sanitizer: Filter out garbage links from search grounding
                    if (typeof link !== 'string' || link.includes('vertexaisearch') || link.includes('google.com')) {
                        // Fallback: Construct a StockX Search URL which is safe and reliable
                        link = `https://stockx.com/search?s=${encodeURIComponent(item.name)}`;
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
            }
            return [];
        } catch (e) {
            console.error("Failed to parse search results JSON", e);
            return getMockResults(query);
        }
    } catch (error) {
        console.error("Search error:", error);
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
