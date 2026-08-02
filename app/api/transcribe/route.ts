import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  api: {
    bodyParser: false,
  },
};

const PASTE_INSTRUCTIONS_HEADER = `Você é um gerador de prompts de imagem e vídeo para produções cinematográficas em 3D.

Vou colar abaixo uma transcrição com timestamps. Gere prompts pareados para CADA cena no seguinte formato:

[MM:SS] SCENE [Número] — [Título da Cena]

Image (Nano Banana 2): [Prompt detalhado em inglês: 3D cinematic photorealism 4K, detalhes consistentes dos personagens, vestimentas, expressão facial, ângulo de câmera e iluminação dramática, finalizando com: cinematic photorealism 4K, high dramatic contrast.]

Video (Veo 3.1 Lite): [Prompt de vídeo em inglês: movimento de câmera (ex: fixed shot with handheld tremor), movimentação e respiração dos personagens, efeitos ambientais, som/ambiente e duração em segundos.]

REGRAS:
• Todos os prompts em inglês.
• Manter o estilo consistente (3D cinematic photorealism 4K).
• Manter a mesma descrição física dos personagens ao longo de todas as cenas.

═══════════════════════════════════════════
TRANSCRIÇÃO COM TIMESTAMPS:
═══════════════════════════════════════════
`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('audio') as File | null;
    const userApiKey = (formData.get('apiKey') as string) || process.env.GEMINI_API_KEY;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'Nenhum arquivo de áudio enviado.' }, { status: 400 });
    }

    if (!userApiKey) {
      return NextResponse.json(
        { ok: false, error: 'Chave de API do Gemini não fornecida. Informe sua chave do Gemini Pro.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'audio/mp3';

    const genAI = new GoogleGenerativeAI(userApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

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

    const result = await model.generateContent([audioPart, prompt]);
    const responseText = result.response.text();

    let rawSegments: Array<{ start: number; text: string }> = [];
    try {
      rawSegments = JSON.parse(responseText);
    } catch {
      // Fallback parser if markdown codeblock wrapped
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        rawSegments = JSON.parse(jsonMatch[0]);
      }
    }

    const segments = rawSegments.map((s) => ({
      start: Number(s.start) || 0,
      text: (s.text || '').trim(),
    })).filter(s => s.text);

    const srtLines = segments.map((s) => {
      const minutes = Math.floor(s.start / 60);
      const seconds = Math.floor(s.start % 60);
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      return `[${mm}:${ss}] ${s.text}`;
    });

    const pasteText = PASTE_INSTRUCTIONS_HEADER + '\n' + srtLines.join('\n');

    return NextResponse.json({
      ok: true,
      count: segments.length,
      segments,
      srt: srtLines.join('\n'),
      paste: pasteText,
    });
  } catch (error: any) {
    console.error('Gemini Transcription Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erro ao processar áudio com Gemini Pro.' },
      { status: 500 }
    );
  }
}
