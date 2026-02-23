import { GoogleGenAI } from "@google/genai";
import { LanguageCode } from "../types";

/**
 * NOTE FOR DEPLOYMENT (Vercel/Netlify):
 * Ensure you have an environment variable named VITE_GEMINI_API_KEY or GEMINI_API_KEY
 * configured in your deployment dashboard. Vite will inject this during the build process.
 */
const API_KEY = process.env.API_KEY;

// Map language codes to full names for the prompt
const LANGUAGE_MAP: Record<LanguageCode, string> = {
  'es': 'Spanish',
  'en': 'English',
  'fr': 'French'
};

export const transcribeAudioStream = async (
  base64Audio: string,
  mimeType: string,
  language: LanguageCode,
  onChunk: (text: string) => void
): Promise<void> => {
  if (!API_KEY) {
    throw new Error("Missing Gemini API Key");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // Providing a clear system instruction to act as a professional transcriber
  const prompt = `Please transcribe the following audio file into ${LANGUAGE_MAP[language]}. 
  If the audio contains multiple speakers, attempt to distinguish them if possible. 
  Output only the transcription text, no preamble or markdown formatting unless necessary for structure.`;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: {
        temperature: 0.2, // Lower temperature for more accurate transcription
        maxOutputTokens: 2048,      
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }

  } catch (error) {
    console.error("Gemini Transcription Error:", error);
    throw error;
  }
};