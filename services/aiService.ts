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