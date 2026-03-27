
import { GoogleGenAI, Type } from '@google/genai';

export interface TranslationResult {
  translation: string;
  definitionEn: string;
  phonetic: string;
  exampleSentence: string;
}

export const getTranslation = async (text: string): Promise<TranslationResult> => {
  try {
    // Use the environment variable provided by Vite/AI Studio
    const key = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!key) {
      throw new Error("API key is missing. Please set GEMINI_API_KEY in your environment.");
    }
    
    const ai = new GoogleGenAI({ apiKey: key });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Act as an expert lexicographer. For the text "${text}":
      1. Translate to Chinese (if English) or English (if Chinese).
      2. Provide a clear, concise English definition (English-to-English).
      3. Provide IPA phonetic notation.
      4. Provide one natural, high-quality example sentence in English.
      
      Return the result in JSON format.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: { type: Type.STRING },
            definitionEn: { type: Type.STRING, description: "English to English definition" },
            phonetic: { type: Type.STRING },
            exampleSentence: { type: Type.STRING, description: "Example sentence in English" },
          },
          required: ["translation", "definitionEn", "phonetic", "exampleSentence"]
        }
      }
    });

    const responseText = response.text || "{}";
    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText);
    } catch (e) {
      const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        parsedResult = JSON.parse(match[1]);
      } else {
        throw new Error("Failed to parse translation response.");
      }
    }

    return parsedResult;
  } catch (error: any) {
    console.error('Translation API Error:', error);
    let errorMessage = 'Failed to translate. Please try again.';
    
    try {
      const errorJson = JSON.parse(error.message);
      if (errorJson.error && errorJson.error.message) {
        errorMessage = errorJson.error.message;
      }
    } catch (e) {
      if (error.message) {
        errorMessage = error.message;
      }
    }

    if (errorMessage.includes('API key not valid')) {
      errorMessage = 'The Gemini API Key is invalid. Please check your AI Studio Settings -> Secrets.';
    }

    throw new Error(errorMessage);
  }
};
