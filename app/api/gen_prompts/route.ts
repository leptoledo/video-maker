import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are an elite AI prompt engineer specialized in 3D cinematic photorealistic visual storytelling.
Your task is to analyze the provided transcript with timestamps and generate paired Image and Video prompts IN ENGLISH for every scene/timestamp.

MASTER STYLE & CONSISTENCY RULES:
• Visual Style: 3D cinematic photorealism 4K, realistic lighting, cinematic depth of field, high dramatic contrast.
• Character Consistency: Create a master character design anchor for all key characters (age, physical build, skin tone, hair, beard, clothing/armor) and maintain these EXACT details consistently across all scene prompts where the characters appear.
• All generated prompts MUST be 100% in English.

EXACT OUTPUT FORMAT FOR EACH SCENE:

[MM:SS] SCENE [Number] — [Brief Scene Title]

Image (Nano Banana 2): [Detailed 3D photorealistic image prompt describing character appearance, facial expression, posture, clothing, background elements, lighting contrast, ending with 'cinematic photorealism 4K, high dramatic contrast.']

Video (Veo 3.1 Lite): [Camera motion details (e.g., fixed shot with handheld tremor, slow tracking zoom), character dynamic actions and breathing, environmental elements motion, sound effect/ambient audio description, duration (e.g. 5-8 seconds).]

(Separate scenes with a blank line).

RULES:
1. Keep chronological order corresponding to the [MM:SS] timestamps.
2. Do not skip any timestamp.
3. Every scene MUST contain both 'Image (Nano Banana 2):' and 'Video (Veo 3.1 Lite):'.
4. Character visual details must remain locked and consistent from scene 1 to the end.`;

async function getAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const defaults = [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.0-pro',
    'gemini-pro',
  ];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models)) {
        const fetched = data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace(/^models\//, ''));

        if (fetched.length > 0) {
          return Array.from(new Set([...fetched, ...defaults]));
        }
      }
    }
  } catch (err) {
    console.warn('[Gemini API] Dynamic models list fetch failed:', err);
  }
  return defaults;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { srt, apiKey } = body;
    const userApiKey = apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!srt) {
      return NextResponse.json({ ok: false, error: 'Transcrição SRT ausente.' }, { status: 400 });
    }

    if (!userApiKey) {
      return NextResponse.json(
        { ok: false, error: 'Chave de API do Gemini Pro não fornecida.' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(userApiKey);
    const candidateModels = await getAvailableGeminiModels(userApiKey);

    const userPrompt = `${SYSTEM_PROMPT}\n\nGenerate one image prompt per timestamp:\n\n${srt}`;

    let result = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        result = await model.generateContent(userPrompt);
        if (result) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini GenPrompts] Model ${modelName} unavailable, trying fallback...`, err?.message);
      }
    }

    if (!result) {
      throw lastError || new Error('Nenhum modelo compatível do Gemini está disponível para esta chave de API.');
    }

    const prompts = result.response.text();

    return NextResponse.json({ ok: true, prompts });
  } catch (error: any) {
    console.error('Gemini Prompt Generation Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erro ao gerar prompts com Gemini Pro.' },
      { status: 500 }
    );
  }
}
