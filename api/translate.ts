import { GoogleGenAI, Type } from '@google/genai';

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing on the server.' });
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

    res.status(200).json(parsedResult);
  } catch (error: any) {
    console.error('Translation API Error:', error);
    res.status(500).json({ error: error.message || 'Failed to translate' });
  }
}
