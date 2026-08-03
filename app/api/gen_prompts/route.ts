import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are an elite AI prompt engineer specialized in 3D cinematic photorealistic visual storytelling AND audio/music score composition for AI generators (Google Flow Music, Lyria 3, Veo).

Your task is to analyze the provided transcript with timestamps and generate:
1. A MASTER BACKGROUND MUSIC PROMPT (for Google Flow Music / Lyria 3) tailored to the overall theme, mood, and genre of the story.
2. Paired Image (Nano Banana 2), Video (Veo 3.1 Lite), and Audio/Music (Google Flow Music) prompts IN ENGLISH for every scene/timestamp.

MASTER STYLE & CONSISTENCY RULES:
• Visual Style: 3D cinematic photorealism 4K, realistic lighting, cinematic depth of field, high dramatic contrast.
• Character Consistency: Create a master character design anchor for all key characters and maintain these EXACT details consistently across all scene prompts.
• Music & Sound Style (Google Flow Music): Specify musical genre, instruments, tempo (BPM), mood, dynamic shifts, and sound effects/ambient foley.
• All generated prompts MUST be 100% in English.

EXACT OUTPUT FORMAT:

==================================================
🎵 MASTER MUSIC PROMPT (GOOGLE FLOW MUSIC / LYRIA)
==================================================
Theme & Mood: [Theme summary and emotional arc]
Genre & Style: [e.g., Cinematic Orchestral / Dark Epic Ambient / Lo-Fi Beats / Emotional Strings]
Instrumentation: [e.g., Grand Piano, Cello, Heavy Drums, Ambient Synth Pads, Brass]
Tempo & Key: [e.g., 75 BPM, slow build-up to dramatic crescendo]
Google Flow Music Prompt: [Complete copy-pasteable prompt for Google Flow Music describing the full music track, mood, instruments, rhythm, and atmosphere...]
==================================================

[MM:SS] SCENE [Number] — [Brief Scene Title]

Image (Nano Banana 2): [Detailed 3D photorealistic image prompt describing character appearance, facial expression, posture, clothing, background elements, lighting contrast, ending with 'cinematic photorealism 4K, high dramatic contrast.']

Video (Veo 3.1 Lite): [Camera motion details, character dynamic actions and breathing, environmental elements motion, sound effect/ambient audio description, duration (5-8 seconds).]

Audio & Music (Google Flow Music): [Specific musical section mood, tempo change, sound effects, foley, atmospheric audio for this scene/timestamp...]

(Separate scenes with a blank line).

RULES:
1. Keep chronological order corresponding to the [MM:SS] timestamps.
2. Do not skip any timestamp.
3. Every scene MUST contain 'Image (Nano Banana 2):', 'Video (Veo 3.1 Lite):', and 'Audio & Music (Google Flow Music):'.
4. Character visual details must remain locked and consistent from scene 1 to the end.`;

async function getAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const defaults = [
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-pro-latest',
  ];
  const obsolete = ['gemini-pro', 'gemini-1.0-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models)) {
        const fetched = data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace(/^models\//, ''))
          .filter((name: string) => !obsolete.includes(name));

        if (fetched.length > 0) {
          return Array.from(new Set([...defaults, ...fetched]));
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
