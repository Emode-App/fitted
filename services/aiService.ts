
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates a realistic outfit using Gemini 3 Pro Image Preview.
 */
export const generateOutfit = async (
  faceImageBase64: string | null,
  clothingImagesBase64: string[],
  prompt: string
): Promise<string> => {
  try {
    const parts: any[] = [];

    // 1. Context Prompt
    parts.push({ 
        text: `Generate a hyper-realistic, high-fashion photo of a person wearing the clothing items provided below.
               The style should be modern and trendy. 
               The fit of the clothes should differ to the specific item type (e.g. baggy pants should look baggy).
               The background should be: ${prompt || "a clean, neutral studio background"}.
               Output a single 1:1 aspect ratio image.` 
    });

    // 2. Add Face Reference
    if (faceImageBase64) {
      const cleanFace = faceImageBase64.split(',')[1] || faceImageBase64;
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
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts },
      config: {
        imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
        }
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

    throw new Error("No image generated.");

  } catch (error) {
    console.error("Generation error:", error);
    throw error;
  }
};

/**
 * Searches for products using Gemini with Google Search Grounding.
 * Simulates a Product API by extracting structured data from search results.
 */
export const searchProducts = async (query: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Search for clothing products matching "${query}".
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
      
      Do not include markdown formatting or backticks. Just the raw JSON string.`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text || '';
    // Clean up markdown if present despite instructions
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const items = JSON.parse(cleanText);
      
      if (Array.isArray(items)) {
          return items.map(item => {
              let link = item.purchaseLink;
              
              // Sanitizer: Filter out garbage links from search grounding
              if (typeof link !== 'string' || link.includes('vertexaisearch') || link.includes('google.com')) {
                  // Fallback: Construct a StockX Search URL which is safe and reliable
                  link = `https://stockx.com/search?s=${encodeURIComponent(item.name)}`;
              }

              return {
                  ...item,
                  // Normalize data
                  price: item.price || 0,
                  purchaseLink: link,
                  // We intentionally don't stress about images here, 
                  // Create.tsx will fallback to Bing Search if this is empty/broken
              };
          });
      }
      return [];
    } catch (e) {
      console.error("Failed to parse search results JSON", e);
      return [];
    }
  } catch (error) {
    console.error("Search error:", error);
    throw error;
  }
};
