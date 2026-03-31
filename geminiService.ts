
import { GoogleGenAI, Type } from '@google/genai';

export interface TranslationResult {
  translation: string;
  definitionEn: string;
  phonetic: string;
  exampleSentence: string;
}

export const getTranslation = async (text: string): Promise<TranslationResult> => {
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Translation API Error:', error);
    let errorMessage = 'Failed to translate. Please try again.';
    
    if (error.message) {
      errorMessage = error.message;
    }

    if (errorMessage.includes('API key not valid') || errorMessage.includes('GEMINI_API_KEY is missing')) {
      errorMessage = 'The Gemini API Key is invalid or missing. Please check your Vercel Environment Variables or AI Studio Settings.';
    }

    throw new Error(errorMessage);
  }
};
