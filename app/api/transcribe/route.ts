import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const PASTE_INSTRUCTIONS_HEADER = `Você é um gerador especialista em prompts para produções cinematográficas em 3D, vídeo e trilha sonora/efeitos de áudio IA (Google Flow Music / Lyria 3 / Veo).

Vou colar abaixo uma transcrição com timestamps. Sua tarefa é analisar a história e gerar:

1. UM PROMPT MESTRE DE MÚSICA DE FUNDO (GOOGLE FLOW MUSIC) no início:
==================================================
🎵 MASTER MUSIC PROMPT (GOOGLE FLOW MUSIC / LYRIA)
==================================================
Theme & Mood: [Resumo do tema e tom emocional]
Genre & Style: [Estilo musical: ex. Cinematic Orchestral, Dark Epic Ambient, Lo-Fi Beats, Strings]
Instrumentation: [Instrumentos principais: ex. Piano, Cello, Bateria Pesada, Sintetizadores]
Tempo & Key: [Tempo/BPM e dinamismo]
Google Flow Music Prompt: [Prompt completo em inglês para colar no Google Flow Music/Lyria 3...]
==================================================

2. PROMPTS PAREADOS PARA CADA CENA NO SEGUINTE FORMATO:

[MM:SS] SCENE [Número] — [Título da Cena]

Image (Nano Banana 2): [Prompt detalhado em inglês: 3D cinematic photorealism 4K, detalhes consistentes dos personagens, vestimentas, expressão facial, ângulo de câmera e iluminação dramática, finalizando com: cinematic photorealism 4K, high dramatic contrast.]

Video (Veo 3.1 Lite): [Prompt de vídeo em inglês: movimento de câmera (ex: fixed shot with handheld tremor), movimentação e respiração dos personagens, efeitos ambientais e duração de 5-8s.]

Audio & Music (Google Flow Music): [Prompt de áudio/música em inglês para a cena: clima musical específico deste trecho, efeitos sonoros (SFX), foley e sons ambientais...]

REGRAS:
• Todos os prompts em inglês.
• Manter o estilo visual consistente (3D cinematic photorealism 4K).
• Manter a mesma descrição física e roupas dos personagens ao longo de todas as cenas.
• Gerar obrigatoriamente para CADA timestamp da transcrição.

═══════════════════════════════════════════
TRANSCRIÇÃO COM TIMESTAMPS:
═══════════════════════════════════════════
`;

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
          fetched.sort((a: string, b: string) => {
            if (a.includes('flash') && !b.includes('flash')) return -1;
            if (!a.includes('flash') && b.includes('flash')) return 1;
            return 0;
          });
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
    const formData = await req.formData();
    const file = formData.get('audio') as File | null;
    const providedApiKey = (formData.get('apiKey') as string) || '';
    const providedGroqKey = (formData.get('groqApiKey') as string) || '';
    const targetAudioDuration = Number(formData.get('audioDuration')) || 0;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'Nenhum arquivo de áudio enviado.' }, { status: 400 });
    }

    // Determine Groq API Key
    const groqApiKey =
      (providedGroqKey && providedGroqKey.startsWith('gsk_') ? providedGroqKey : null) ||
      (providedApiKey && providedApiKey.startsWith('gsk_') ? providedApiKey : null) ||
      process.env.GROQ_API_KEY ||
      process.env.NEXT_PUBLIC_GROQ_API_KEY;

    // 1. GROQ WHISPER API (PREFERRED & ULTRA FAST FOR VERCEL)
    if (groqApiKey) {
      try {
        let groqRes: Response | null = null;
        let groqErrText = '';

        const origName = file.name || 'audio.mp3';
        const extMatch = origName.match(/\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|opus|wav|webm)$/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
        const mimeType = file.type && file.type.includes('audio') ? file.type : `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
        const cleanFile = new File([await file.arrayBuffer()], `audio.${ext}`, { type: mimeType });

        const modelsToTry = ['whisper-large-v3-turbo', 'whisper-large-v3'];
        for (const modelName of modelsToTry) {
          const groqFormData = new FormData();
          groqFormData.append('file', cleanFile, `audio.${ext}`);
          groqFormData.append('model', modelName);
          groqFormData.append('response_format', 'verbose_json');
          groqFormData.append('language', 'pt');

          groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${groqApiKey.trim()}`,
            },
            body: groqFormData,
          });

          if (groqRes.ok) break;
          groqErrText = await groqRes.text();
        }

        if (!groqRes || !groqRes.ok) {
          let readableErr = groqErrText;
          try {
            const parsed = JSON.parse(groqErrText);
            readableErr = parsed.error?.message || groqErrText;
          } catch {}

          if (groqRes?.status === 401) {
            readableErr = 'Chave do Groq API inválida. Verifique se a chave inserida inicia com gsk_';
          }

          return NextResponse.json(
            { ok: false, error: `Erro na API do Groq (${groqRes?.status || 'Erro'}): ${readableErr}` },
            { status: groqRes?.status || 400 }
          );
        }

        const groqData = await groqRes.json();
        const rawSegments = groqData.segments || [];

        const segments = rawSegments
          .map((s: any) => ({
            start: Math.floor(Number(s.start) || 0),
            text: (s.text || '').trim(),
          }))
          .filter((s: any) => s.text);

        const srtLines = segments.map((s: any) => {
          const minutes = Math.floor(s.start / 60);
          const seconds = Math.floor(s.start % 60);
          const mm = String(minutes).padStart(2, '0');
          const ss = String(seconds).padStart(2, '0');
          return `[${mm}:${ss}] ${s.text}`;
        });

        const pasteText = PASTE_INSTRUCTIONS_HEADER + '\n' + srtLines.join('\n');

        return NextResponse.json({
          ok: true,
          provider: 'Groq Whisper',
          count: segments.length,
          segments,
          srt: srtLines.join('\n'),
          paste: pasteText,
        });
      } catch (groqErr: any) {
        console.warn('[Groq API Error]:', groqErr?.message);
        return NextResponse.json({ ok: false, error: `Erro na API do Groq: ${groqErr.message}` }, { status: 400 });
      }
    }

    // 2. GEMINI PRO API FALLBACK (WITH TIMESTAMP NORMALIZATION/CALIBRATION)
    const geminiApiKey =
      (providedApiKey && !providedApiKey.startsWith('gsk_') ? providedApiKey : null) ||
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!geminiApiKey) {
      return NextResponse.json(
        { ok: false, error: 'Forneça uma chave do Groq API (gsk_...) ou do Google Gemini API para transcrever.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'audio/mp3';

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const candidateModels = await getAvailableGeminiModels(geminiApiKey);

    const prompt = `Transcreva este áudio com precisão em Português e divida em segmentos curtos com timestamps (em segundos).
Retorne estritamente um array JSON com a estrutura:
[
  { "start": number_in_seconds, "text": "Texto transcrito..." }
]`;

    const audioPart = {
      inlineData: {
        data: base64Audio,
        mimeType: mimeType.includes('audio') ? mimeType : 'audio/mp3',
      },
    };

    let result = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' },
        });
        result = await model.generateContent([audioPart, prompt]);
        if (result) break;
      } catch (err: any) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          result = await model.generateContent([audioPart, prompt]);
          if (result) break;
        } catch (retryErr: any) {
          lastError = retryErr;
          console.warn(`[Gemini Transcribe] Model ${modelName} failed:`, retryErr?.message);
        }
      }
    }

    if (!result) {
      throw lastError || new Error('Nenhum modelo disponível para esta chave do Gemini.');
    }

    const responseText = result.response.text();

    let rawSegments: Array<{ start: number; text: string }> = [];
    try {
      rawSegments = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        rawSegments = JSON.parse(jsonMatch[0]);
      }
    }

    let parsedSegments = rawSegments
      .map((s) => ({
        start: Number(s.start) || 0,
        text: (s.text || '').trim(),
      }))
      .filter((s) => s.text);

    // Apply Timestamp Normalization Calibration if Gemini drifted beyond real duration
    if (parsedSegments.length > 0) {
      const maxStart = Math.max(...parsedSegments.map((s) => s.start));
      if (targetAudioDuration > 0 && maxStart > targetAudioDuration * 1.1) {
        const calibrationRatio = (targetAudioDuration * 0.95) / maxStart;
        parsedSegments = parsedSegments.map((s) => ({
          start: Math.floor(s.start * calibrationRatio),
          text: s.text,
        }));
      }
    }

    const srtLines = parsedSegments.map((s) => {
      const minutes = Math.floor(s.start / 60);
      const seconds = Math.floor(s.start % 60);
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      return `[${mm}:${ss}] ${s.text}`;
    });

    const pasteText = PASTE_INSTRUCTIONS_HEADER + '\n' + srtLines.join('\n');

    return NextResponse.json({
      ok: true,
      provider: 'Gemini (Calibrado)',
      count: parsedSegments.length,
      segments: parsedSegments,
      srt: srtLines.join('\n'),
      paste: pasteText,
    });
  } catch (error: any) {
    console.error('Transcription Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erro ao processar áudio.' },
      { status: 500 }
    );
  }
}
