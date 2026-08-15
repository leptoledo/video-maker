'use client';

import React, { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HeroHeader } from '@/components/HeroHeader';
import { SupportPix } from '@/components/SupportPix';
import { generateCapCutZip, SceneImage } from '@/lib/capcut-zip';
import {
  FileAudio,
  Sparkles,
  Copy,
  Download,
  ImagePlus,
  Film,
  CheckCircle,
  AlertCircle,
  Key,
  Check,
  Loader2,
  Trash2,
  RotateCcw,
  Music,
  Volume2,
} from 'lucide-react';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const PASTE_HEADER = `Você é um gerador especialista em prompts para produções cinematográficas em 3D, vídeo e trilha sonora/efeitos de áudio IA (Google Flow Music / Lyria 3 / Veo).

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

export default function HomePage() {
  // Step 1 State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [apiKey, setApiKey] = useState<string>('');
  const [groqApiKey, setGroqApiKey] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribeNote, setTranscribeNote] = useState<{ type: 'ok' | 'err' | 'warn'; msg: string } | null>(null);

  // Step 2 State
  const [segments, setSegments] = useState<Array<{ start: number; text: string }>>([]);
  const [srtText, setSrtText] = useState<string>('');
  const [pasteText, setPasteText] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isGenPrompts, setIsGenPrompts] = useState<boolean>(false);
  const [aiPrompts, setAiPrompts] = useState<string>('');

  // Step 3 State
  const [imageFiles, setImageFiles] = useState<SceneImage[]>([]);
  const [imageFolderNote, setImageFolderNote] = useState<{ type: 'ok' | 'err' | 'warn'; msg: string } | null>(null);

  // Step 4 State
  const [isAssembling, setIsAssembling] = useState<boolean>(false);
  const [assembleNote, setAssembleNote] = useState<{ type: 'ok' | 'err' | 'warn'; msg: string } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const [restoredAudioName, setRestoredAudioName] = useState<string>('');

  const parseSrtTextToSegments = (text: string): Array<{ start: number; text: string }> => {
    const lines = text.split('\n');
    const result: Array<{ start: number; text: string }> = [];
    const pat = /\[(\d{1,2}):(\d{2})\]\s*(.*)/;
    lines.forEach((line) => {
      const m = pat.exec(line);
      if (m) {
        const mins = parseInt(m[1], 10);
        const secs = parseInt(m[2], 10);
        const content = m[3].trim();
        if (content) {
          result.push({ start: mins * 60 + secs, text: content });
        }
      }
    });
    return result;
  };

  useEffect(() => {
    const savedGeminiKey = localStorage.getItem('lctnet_gemini_key');
    const envGeminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    if (savedGeminiKey) {
      setApiKey(savedGeminiKey);
    } else if (envGeminiKey) {
      setApiKey(envGeminiKey);
    }

    const savedGroqKey = localStorage.getItem('lctnet_groq_key');
    const envGroqKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || '';
    if (savedGroqKey) {
      setGroqApiKey(savedGroqKey);
    } else if (envGroqKey) {
      setGroqApiKey(envGroqKey);
    }

    // Restore saved transcription session if available
    try {
      const savedSession = localStorage.getItem('lctnet_saved_session');
      if (savedSession) {
        const data = JSON.parse(savedSession);
        if (data.srtText && data.srtText.trim()) {
          setSrtText(data.srtText);
          const parsedSegs = parseSrtTextToSegments(data.srtText);
          setSegments(parsedSegs.length ? parsedSegs : data.segments || []);
          setPasteText(data.pasteText || (PASTE_HEADER + '\n' + data.srtText));
          if (data.aiPrompts) setAiPrompts(data.aiPrompts);
          if (data.audioDuration) setAudioDuration(data.audioDuration);
          if (data.audioFileName) setRestoredAudioName(data.audioFileName);

          setTranscribeNote({
            type: 'ok',
            msg: `✓ Transcrição recuperada do navegador! (${data.audioFileName || 'Sessão salva'})`,
          });
        }
      }
    } catch (e) {
      console.warn('Erro ao restaurar sessão salva:', e);
    }
  }, []);

  // Auto-save session to localStorage whenever transcription or prompts change
  useEffect(() => {
    if (srtText && srtText.trim()) {
      try {
        const sessionData = {
          segments,
          srtText,
          pasteText,
          aiPrompts,
          audioFileName: audioFile?.name || restoredAudioName || '',
          audioDuration,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem('lctnet_saved_session', JSON.stringify(sessionData));
      } catch (e) {
        console.warn('Erro ao salvar sessão no localStorage:', e);
      }
    }
  }, [srtText, segments, pasteText, aiPrompts, audioFile, restoredAudioName, audioDuration]);

  const handleSaveKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('lctnet_gemini_key', val);
  };

  const handleSaveGroqKey = (val: string) => {
    setGroqApiKey(val);
    localStorage.setItem('lctnet_groq_key', val);
  };

  const handleClearSession = () => {
    if (window.confirm('Deseja realmente limpar a transcrição salva e iniciar um novo projeto?')) {
      localStorage.removeItem('lctnet_saved_session');
      setAudioFile(null);
      setAudioDuration(0);
      setRestoredAudioName('');
      setSegments([]);
      setSrtText('');
      setPasteText('');
      setAiPrompts('');
      setImageFiles([]);
      setDownloadUrl(null);
      setTranscribeNote(null);
      setImageFolderNote(null);
      setAssembleNote(null);
    }
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setTranscribeNote(null);
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration || 0);
      };
    }
  };

  const handleTranscribe = async () => {
    if (!audioFile) return;

    setIsTranscribing(true);
    setTranscribeNote(null);

    const activeGroqKey =
      groqApiKey.trim() ||
      (apiKey.trim().startsWith('gsk_') ? apiKey.trim() : '') ||
      process.env.NEXT_PUBLIC_GROQ_API_KEY ||
      '';

    const activeGeminiKey =
      apiKey.trim() && !apiKey.trim().startsWith('gsk_')
        ? apiKey.trim()
        : process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

    // 1. GROQ WHISPER CLIENT-SIDE EXECUTION (100% PRECISE TIMESTAMPS & ULTRA FAST)
    if (activeGroqKey) {
      try {
        let groqRes: Response | null = null;
        let groqErrText = '';

        const modelsToTry = ['whisper-large-v3-turbo', 'whisper-large-v3'];
        for (const modelName of modelsToTry) {
          const groqFormData = new FormData();
          groqFormData.append('file', audioFile);
          groqFormData.append('model', modelName);
          groqFormData.append('response_format', 'verbose_json');
          groqFormData.append('language', 'pt');

          groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${activeGroqKey.trim()}`,
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
            readableErr = 'Chave do Groq API inválida. Verifique se a chave inserida no campo do Groq está correta e inicia com gsk_';
          } else if (groqRes?.status === 413) {
            readableErr = 'O arquivo de áudio excede o limite do Groq API (25MB).';
          }

          setIsTranscribing(false);
          setTranscribeNote({
            type: 'err',
            msg: `✗ Erro na API do Groq (${groqRes?.status || 'Erro'}): ${readableErr}`,
          });
          return;
        }

        const groqData = await groqRes.json();
        const rawSegments = groqData.segments || [];

        const parsedSegments = rawSegments
          .map((s: any) => ({
            start: Math.floor(Number(s.start) || 0),
            text: (s.text || '').trim(),
          }))
          .filter((s: any) => s.text);

        const srtLines = parsedSegments.map((s: any) => {
          const minutes = Math.floor(s.start / 60);
          const seconds = Math.floor(s.start % 60);
          const mm = String(minutes).padStart(2, '0');
          const ss = String(seconds).padStart(2, '0');
          return `[${mm}:${ss}] ${s.text}`;
        });

        setIsTranscribing(false);
        setSegments(parsedSegments);
        setSrtText(srtLines.join('\n'));
        setPasteText(PASTE_HEADER + '\n' + srtLines.join('\n'));
        setTranscribeNote({
          type: 'ok',
          msg: `✓ ${parsedSegments.length} segmentos transcritos com precisão absoluta via Groq Whisper API!`,
        });
        return;
      } catch (err: any) {
        console.error('Client-side Groq Error:', err);
        setIsTranscribing(false);
        setTranscribeNote({
          type: 'err',
          msg: `✗ Erro na Chave Groq API: ${err.message || 'Verifique se a chave informada inicia com gsk_'}`,
        });
        return;
      }
    }

    // 2. GEMINI PRO CLIENT-SIDE EXECUTION (WITH TIMESTAMP CALIBRATION)
    if (activeGeminiKey) {
      try {
        const base64Audio = await fileToBase64(audioFile);
        const mimeType = audioFile.type || 'audio/mp3';
        const genAI = new GoogleGenerativeAI(activeGeminiKey);

        const candidateModels = [
          'gemini-flash-latest',
          'gemini-2.5-flash-lite',
          'gemini-flash-lite-latest',
          'gemini-2.0-flash-lite',
          'gemini-2.0-flash',
          'gemini-pro-latest',
        ];

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
          } catch (err) {
            try {
              const model = genAI.getGenerativeModel({ model: modelName });
              result = await model.generateContent([audioPart, prompt]);
              if (result) break;
            } catch (retryErr: any) {
              lastError = retryErr;
            }
          }
        }

        if (!result) {
          throw lastError || new Error('Não foi possível conectar com os modelos do Gemini.');
        }

        const responseText = result.response.text();
        let rawSegments: Array<{ start: number; text: string }> = [];
        try {
          rawSegments = JSON.parse(responseText);
        } catch {
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) rawSegments = JSON.parse(jsonMatch[0]);
        }

        let parsedSegments = rawSegments
          .map((s) => ({
            start: Number(s.start) || 0,
            text: (s.text || '').trim(),
          }))
          .filter((s) => s.text);

        // Calibrate Gemini timestamps if they drifted beyond actual audio duration
        if (parsedSegments.length > 0) {
          const maxStart = Math.max(...parsedSegments.map((s) => s.start));
          if (audioDuration > 0 && maxStart > audioDuration * 1.1) {
            const calibrationRatio = (audioDuration * 0.95) / maxStart;
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

        setIsTranscribing(false);
        setSegments(parsedSegments);
        setSrtText(srtLines.join('\n'));
        setPasteText(PASTE_HEADER + '\n' + srtLines.join('\n'));
        setTranscribeNote({
          type: 'ok',
          msg: `✓ ${parsedSegments.length} segmentos transcritos (calibrados) com Gemini Pro!`,
        });
        return;
      } catch (err: any) {
        console.error('Client-side Gemini Error:', err);
        setIsTranscribing(false);
        setTranscribeNote({
          type: 'err',
          msg: `✗ Erro na Chave Gemini API: ${err.message || 'Verifique se a chave informada é uma chave válida.'}`,
        });
        return;
      }
    }

    // 3. SERVER ROUTE FALLBACK (SERVERLESS VERCEL API)
    if (audioFile.size > 4.5 * 1024 * 1024) {
      setIsTranscribing(false);
      setTranscribeNote({
        type: 'err',
        msg: `⚠ O arquivo de áudio (${(audioFile.size / (1024 * 1024)).toFixed(1)}MB) excede o limite da Vercel (4.5MB). Cole sua Chave Groq (gsk_...) ou Gemini API no campo acima para processar diretamente no navegador sem limites!`,
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      if (groqApiKey) formData.append('groqApiKey', groqApiKey);
      if (apiKey) formData.append('apiKey', apiKey);
      if (audioDuration) formData.append('audioDuration', String(audioDuration));

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const rawText = await res.text();
        let errorMsg = 'Erro no servidor durante a transcrição.';
        try {
          const parsed = JSON.parse(rawText);
          errorMsg = parsed.error || errorMsg;
        } catch {
          if (res.status === 504) {
            errorMsg = 'O tempo de resposta excedeu 10s. Informe sua Chave Groq API no campo acima para transcrever em 2 segundos sem limitações!';
          } else if (res.status === 413) {
            errorMsg = 'O arquivo de áudio excede o limite da Vercel (4.5MB). Cole sua Chave API no campo acima para processar diretamente no navegador.';
          } else {
            errorMsg = `Erro no servidor (${res.status}): ${rawText.slice(0, 150)}`;
          }
        }
        setIsTranscribing(false);
        setTranscribeNote({ type: 'err', msg: `✗ ${errorMsg}` });
        return;
      }

      const data = await res.json();
      setIsTranscribing(false);

      if (data.ok) {
        setSegments(data.segments);
        setSrtText(data.srt);
        setPasteText(data.paste);
        setTranscribeNote({
          type: 'ok',
          msg: `✓ ${data.count} segmentos transcritos com sucesso (${data.provider || 'API'})!`,
        });
      } else {
        setTranscribeNote({
          type: 'err',
          msg: `✗ ${data.error || 'Erro na transcrição'}`,
        });
      }
    } catch (err: any) {
      setIsTranscribing(false);
      setTranscribeNote({
        type: 'err',
        msg: `✗ Erro de conexão: ${err.message}`,
      });
    }
  };

  const handleCopyPaste = async () => {
    if (!pasteText) return;
    await navigator.clipboard.writeText(pasteText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleDownloadTxt = () => {
    if (!pasteText) return;
    const blob = new Blob([pasteText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'prompt_e_transcricao.txt';
    a.click();
  };

  const formatSrtTime = (totalSecs: number): string => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = Math.floor(totalSecs % 60);
    const millis = Math.floor((totalSecs % 1) * 1000);
    const hh = String(hrs).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    const mmm = String(millis).padStart(3, '0');
    return `${hh}:${mm}:${ss},${mmm}`;
  };

  const handleDownloadSrt = () => {
    const currentSegments = segments.length ? segments : parseSrtTextToSegments(srtText);
    if (!currentSegments.length) return;

    const srtContent = currentSegments
      .map((seg, idx) => {
        const startTime = formatSrtTime(seg.start);
        let nextStart = idx < currentSegments.length - 1 ? currentSegments[idx + 1].start : seg.start + 4;
        if (audioDuration && idx === currentSegments.length - 1 && audioDuration > seg.start) {
          nextStart = audioDuration;
        }
        if (nextStart <= seg.start) {
          nextStart = seg.start + 3;
        }
        const endTime = formatSrtTime(nextStart);
        return `${idx + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
      })
      .join('\n');

    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const rawName = audioFile?.name || restoredAudioName || 'legenda';
    a.download = `${rawName.replace(/\.[^/.]+$/, '')}.srt`;
    a.click();
  };

  const [isMusicCopied, setIsMusicCopied] = useState<boolean>(false);
  const [isAllPromptsCopied, setIsAllPromptsCopied] = useState<boolean>(false);

  const handleCopyMusicPrompts = async () => {
    if (!aiPrompts) return;
    const musicSectionMatch = aiPrompts.match(/MASTER MUSIC PROMPT[\s\S]*?(?=\n\n\[|\n\[)/i);
    const musicSection = musicSectionMatch ? musicSectionMatch[0] : '';
    const sceneAudioLines = aiPrompts
      .split('\n')
      .filter((line) => line.startsWith('Audio & Music') || line.startsWith('Music (Google Flow') || line.includes('GOOGLE FLOW MUSIC'))
      .join('\n');

    const fullMusicText = musicSection
      ? `${musicSection}\n\n==================================================\n🔊 SCENE AUDIO & SFX PROMPTS\n==================================================\n${sceneAudioLines}`
      : aiPrompts;

    await navigator.clipboard.writeText(fullMusicText);
    setIsMusicCopied(true);
    setTimeout(() => setIsMusicCopied(false), 2500);
  };

  const handleCopyAllPrompts = async () => {
    if (!aiPrompts) return;
    await navigator.clipboard.writeText(aiPrompts);
    setIsAllPromptsCopied(true);
    setTimeout(() => setIsAllPromptsCopied(false), 2500);
  };

  const handleGenPromptsAI = async () => {
    if (!srtText) return;
    setIsGenPrompts(true);
    const activeKey = apiKey.trim() || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

    if (activeKey) {
      try {
        const genAI = new GoogleGenerativeAI(activeKey);
        const candidateModels = [
          'gemini-flash-latest',
          'gemini-2.5-flash-lite',
          'gemini-flash-lite-latest',
          'gemini-2.0-flash-lite',
          'gemini-2.0-flash',
          'gemini-pro-latest',
        ];
        const userPrompt = `You are an elite AI prompt engineer specialized in 3D cinematic photorealistic visual storytelling AND audio/music score composition for AI generators (Google Flow Music, Lyria 3, Veo).

Your task is to analyze the provided transcript with timestamps and generate:
1. A MASTER BACKGROUND MUSIC PROMPT (for Google Flow Music / Lyria 3) tailored to the overall theme, mood, and genre of the story.
2. Paired Image (Nano Banana 2), Video (Veo 3.1 Lite), and Audio/Music (Google Flow Music) prompts IN ENGLISH for every scene/timestamp.

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

Transcript:

${srtText}`;

        let result = null;
        let lastError = null;
        for (const modelName of candidateModels) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            result = await model.generateContent(userPrompt);
            if (result) break;
          } catch (err: any) {
            lastError = err;
          }
        }

        if (result) {
          const prompts = result.response.text();
          setIsGenPrompts(false);
          setAiPrompts(prompts);
          const blob = new Blob([prompts], { type: 'text/plain;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'prompts_gerados_gemini.txt';
          a.click();
          return;
        }
      } catch (err) {
        console.warn('Client-side gen prompts fallback to route:', err);
      }
    }

    try {
      const res = await fetch('/api/gen_prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srt: srtText, apiKey: activeKey }),
      });
      const data = await res.json();
      setIsGenPrompts(false);
      if (data.ok) {
        setAiPrompts(data.prompts);
        const blob = new Blob([data.prompts], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'prompts_gerados_gemini.txt';
        a.click();
      } else {
        alert('Erro ao gerar prompts: ' + data.error);
      }
    } catch (e: any) {
      setIsGenPrompts(false);
      alert('Erro: ' + e.message);
    }
  };

  const parseImageTimestamp = (filename: string): number | null => {
    // 1. [MM-SS], [MM:SS], [MM_SS]
    let m = /\[(\d{1,2})[-:_](\d{2})\]/.exec(filename);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);

    // 2. MMmSSs (e.g. 01m30s)
    m = /(\d{1,2})m(\d{2})s/i.exec(filename);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);

    // 3. MM-SS, MM:SS, MM_SS anywhere in filename (e.g. 00-14, 01_30, 00:14)
    m = /(?:^|[^\d])(\d{1,2})[-:_](\d{2})(?:[^\d]|$)/.exec(filename);
    if (m) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      if (mins < 60 && secs < 60) {
        return mins * 60 + secs;
      }
    }

    return null;
  };

  const processMediaFiles = (
    newFiles: File[],
    append: boolean = false
  ): { items: SceneImage[]; note: { type: 'ok' | 'warn'; msg: string } } => {
    const validFiles = newFiles.filter((f) =>
      /\.(jpg|jpeg|png|webp|mp4|mov|webm|mkv|avi)$/i.test(f.name)
    );
    if (!validFiles.length) {
      return {
        items: append ? imageFiles : [],
        note: {
          type: 'warn',
          msg: '⚠ Nenhum arquivo de mídia válido (.jpg, .png, .webp, .mp4, .mov, .webm) selecionado.',
        },
      };
    }

    const combinedFiles = append
      ? [...imageFiles.map((m) => m.file), ...validFiles]
      : validFiles;

    const parsedWithTs: SceneImage[] = [];
    const unparsedFiles: File[] = [];

    combinedFiles.forEach((f) => {
      const ts = parseImageTimestamp(f.name);
      const isVideo = /\.(mp4|mov|webm|mkv|avi)$/i.test(f.name);
      const type: 'image' | 'video' = isVideo ? 'video' : 'image';
      if (ts !== null) {
        parsedWithTs.push({ name: f.name, timestamp: ts, file: f, type });
      } else {
        unparsedFiles.push(f);
      }
    });

    if (parsedWithTs.length > 0) {
      parsedWithTs.sort((a, b) => a.timestamp - b.timestamp);
      const imgCount = parsedWithTs.filter((m) => m.type !== 'video').length;
      const vidCount = parsedWithTs.filter((m) => m.type === 'video').length;
      const parts = [];
      if (imgCount > 0) parts.push(`${imgCount} imagem(ns)`);
      if (vidCount > 0) parts.push(`${vidCount} vídeo(s)`);

      return {
        items: parsedWithTs,
        note: {
          type: 'ok',
          msg: `✓ ${parts.join(' e ')} com timestamp carregados e organizados!`,
        },
      };
    } else {
      unparsedFiles.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

      const totalDuration =
        audioDuration ||
        (segments.length ? Math.max(...segments.map((s) => s.start)) + 10 : 60);
      const autoParsed: SceneImage[] = unparsedFiles.map((f, index) => {
        let ts = 0;
        if (segments.length && index < segments.length) {
          ts = segments[index].start;
        } else {
          ts = Math.floor((index / unparsedFiles.length) * totalDuration);
        }
        const isVideo = /\.(mp4|mov|webm|mkv|avi)$/i.test(f.name);
        const type: 'image' | 'video' = isVideo ? 'video' : 'image';
        return { name: f.name, timestamp: ts, file: f, type };
      });

      const imgCount = autoParsed.filter((m) => m.type !== 'video').length;
      const vidCount = autoParsed.filter((m) => m.type === 'video').length;
      const parts = [];
      if (imgCount > 0) parts.push(`${imgCount} imagem(ns)`);
      if (vidCount > 0) parts.push(`${vidCount} vídeo(s)`);

      return {
        items: autoParsed,
        note: {
          type: 'ok',
          msg: `✓ ${parts.join(' e ')} carregados em ordem sequencial (${unparsedFiles[0]?.name}...)`,
        },
      };
    }
  };

  const handleImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const res = processMediaFiles(files, true);
    setImageFiles(res.items);
    setImageFolderNote(res.note);
  };

  const handleVideosSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const res = processMediaFiles(files, true);
    setImageFiles(res.items);
    setImageFolderNote(res.note);
  };

  const handleAssembleCapCut = async () => {
    if (imageFiles.length === 0) return;
    setIsAssembling(true);
    setAssembleNote(null);

    try {
      const rawName = audioFile?.name || restoredAudioName || 'LctnetVideo';
      const projectName = `LctnetVideo_${rawName.replace(/\.[^/.]+$/, '').slice(0, 16)}`;
      const zipBlob = await generateCapCutZip(
        projectName,
        audioFile,
        audioDuration || 60,
        imageFiles
      );

      const url = URL.createObjectURL(zipBlob);
      setDownloadUrl(url);
      setIsAssembling(false);

      const audioNotice = audioFile
        ? ''
        : ' (Para incluir o arquivo .mp3 dentro do .ZIP, basta selecionar o áudio no Passo 1)';

      setAssembleNote({
        type: 'ok',
        msg: `✓ ${imageFiles.length} mídias montadas! Arquivo .ZIP do CapCut gerado.${audioNotice}`,
      });

      // Trigger automatic download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}_CapCut.zip`;
      a.click();
    } catch (err: any) {
      setIsAssembling(false);
      setAssembleNote({
        type: 'err',
        msg: `✗ Erro ao gerar rascunho CapCut: ${err.message}`,
      });
    }
  };

  const step1Done = !!audioFile || !!segments.length || !!srtText.trim();
  const step2Done = !!segments.length || !!srtText.trim();
  const step3Done = imageFiles.length > 0;
  const step4Done = !!downloadUrl;

  const handleSrtTextChange = (val: string) => {
    setSrtText(val);
    setPasteText(PASTE_HEADER + '\n' + val);
    const parsedSegs = parseSrtTextToSegments(val);
    if (parsedSegs.length > 0) {
      setSegments(parsedSegs);
    }
  };

  return (
    <div className="min-h-screen flex justify-center py-6 px-4">
      <div className="w-full max-w-[640px] pb-12">
        <HeroHeader />

        {/* PASSO 1: ÁUDIO */}
        <div
          className={`bg-surface border rounded-xl p-4 mb-4 transition-all ${step1Done ? 'border-green/40' : 'border-accent/40 shadow-[0_0_16px_rgba(255,34,68,0.12)]'
            }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border ${step1Done
                  ? 'bg-green border-green text-[#04220f]'
                  : 'bg-surface-el border-accent text-accent'
                }`}
            >
              1
            </div>
            <div className="text-xs font-extrabold tracking-wider uppercase text-text">
              Áudio & Chaves de API (Groq Whisper / Gemini)
            </div>
          </div>

          {/* Groq API Key Input (Preferred for Whisper on Vercel) */}
          <div className="mb-3">
            <label className="text-[11px] text-text-muted flex items-center justify-between mb-1 font-semibold">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-green" /> Chave Groq API (Whisper 100% Preciso):
              </span>
              <span className="text-[10px] text-green font-normal">
                {groqApiKey ? '✓ Salva no navegador' : '⚡ 100% Grátis & Ultra-Rápido'}
              </span>
            </label>
            <input
              type="password"
              value={groqApiKey}
              onChange={(e) => handleSaveGroqKey(e.target.value)}
              placeholder="Cole sua gsk_... (Obtenha grátis em console.groq.com)"
              className="w-full px-3 py-2 text-xs font-mono bg-surface-el border border-border-strong rounded-lg text-text focus:outline-none focus:border-green"
            />
            <div className="text-[10px] text-text-muted/80 mt-1 flex justify-between">
              <span>🚀 Transcreve áudios em 2 segundos com timestamps exatos no tempo real!</span>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-cyan underline hover:text-white"
              >
                Criar chave grátis no Groq ↗
              </a>
            </div>
          </div>

          {/* Gemini Key Input */}
          <div className="mb-3">
            <label className="text-[11px] text-text-muted flex items-center justify-between mb-1 font-semibold">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber" /> Chave Gemini API (Google Gemini Pro):
              </span>
              <span className="text-[10px] text-text-muted font-normal">
                {apiKey ? '✓ Salva' : 'Opcional (Fallback)'}
              </span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              placeholder="Cole sua AIzaSy... (ou defina no ambiente)"
              className="w-full px-3 py-2 text-xs font-mono bg-surface-el border border-border-strong rounded-lg text-text focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-0 text-xs text-text-muted truncate">
              {audioFile ? audioFile.name : restoredAudioName ? `Sessão Salva (${restoredAudioName})` : 'Nenhum arquivo selecionado'}
            </span>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-surface-el border border-border-strong text-text cursor-pointer hover:-translate-y-0.5 transition-all">
              <FileAudio className="w-4 h-4 text-accent" />
              <span>{audioFile ? 'Alterar áudio' : 'Selecionar áudio'}</span>
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioSelect}
                className="hidden"
              />
            </label>
          </div>

          <div className={`mt-3 glow ${isTranscribing ? 'on' : ''}`}>
            <button
              onClick={handleTranscribe}
              disabled={!audioFile || isTranscribing}
              className="w-full py-3 px-4 rounded-lg font-bold text-xs text-white bg-gradient-to-r from-accent to-orange shadow-[0_0_16px_rgba(255,34,68,0.35)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all hover:brightness-110"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transcrevendo áudio...</span>
                </>
              ) : (
                <>
                  <span>
                    {groqApiKey || apiKey.startsWith('gsk_')
                      ? '⚡ Transcrever com Groq Whisper (Ultra-Rápido)'
                      : '▶ Transcrever Áudio'}
                  </span>
                </>
              )}
            </button>
          </div>

          {transcribeNote && (
            <div
              className={`text-xs mt-2 font-medium ${transcribeNote.type === 'ok'
                  ? 'text-green'
                  : transcribeNote.type === 'warn'
                    ? 'text-orange'
                    : 'text-accent'
                }`}
            >
              {transcribeNote.msg}
            </div>
          )}
        </div>

        {/* PASSO 2: TRANSCRIÇÃO + PROMPTS */}
        <div
          className={`bg-surface border rounded-xl p-4 mb-4 transition-all ${!step1Done
              ? 'opacity-40 pointer-events-none'
              : step2Done
                ? 'border-green/40'
                : 'border-accent/40 shadow-[0_0_16px_rgba(255,34,68,0.12)]'
            }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border ${step2Done
                  ? 'bg-green border-green text-[#04220f]'
                  : 'bg-surface-el border-accent text-accent'
                }`}
            >
              2
            </div>
            <div className="text-xs font-extrabold tracking-wider uppercase text-text">
              Transcrição + Prompts
            </div>
            {srtText && (
              <button
                onClick={handleClearSession}
                title="Limpar transcrição salva e iniciar novo projeto"
                className="ml-auto text-[11px] font-bold text-accent/80 hover:text-accent flex items-center gap-1 px-2.5 py-1 bg-accent/10 border border-accent/30 rounded-md transition-all hover:bg-accent/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Nova Transcrição</span>
              </button>
            )}
          </div>

          <textarea
            value={srtText}
            onChange={(e) => handleSrtTextChange(e.target.value)}
            placeholder="A transcrição com timestamps aparece aqui..."
            className="w-full h-36 p-3 text-xs font-mono bg-surface-el border border-border-strong rounded-lg text-text resize-y focus:outline-none focus:border-accent"
          />

          <div className="flex items-center gap-2 flex-wrap mt-3">
            <button
              onClick={handleCopyPaste}
              disabled={!pasteText}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-green text-[#04220f] shadow-[0_0_12px_rgba(0,255,136,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-30"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>✓ Copiado! Cole no Claude/ChatGPT</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>📋 Copiar Prompt + SRT</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadTxt}
              disabled={!pasteText}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-surface-el border border-border-strong text-text hover:-translate-y-0.5 transition-all disabled:opacity-30"
            >
              <Download className="w-4 h-4" />
              <span>↓ Salvar .txt</span>
            </button>

            <button
              onClick={handleDownloadSrt}
              disabled={!srtText}
              title="Baixar arquivo de legenda padrão SubRip (.srt) para importar no CapCut, Premiere, etc."
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-cyan/15 border border-cyan/40 text-cyan hover:-translate-y-0.5 transition-all disabled:opacity-30"
            >
              <Film className="w-4 h-4 text-cyan" />
              <span>🎬 Salvar Legenda (.srt)</span>
            </button>

          </div>

          <div className="text-[11px] text-text-muted/70 mt-2">
            💡 Dica: Prompts gerados para <strong className="text-white">Image (Nano Banana 2)</strong>, <strong className="text-white">Video (Veo 3.1 Lite)</strong> e <strong className="text-white">Music & Sons (Google Flow Music / Lyria 3)</strong>.
          </div>

          {/* PROMPTS GERADOS PELA IA (IMAGEM + VÍDEO + MÚSICA GOOGLE FLOW) */}
          {aiPrompts && (
            <div className="mt-4 pt-4 border-t border-border-strong/60">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-bold text-orange flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-orange" />
                  <span>Prompts Gerados (Visual + Google Flow Music & SFX)</span>
                </div>
              </div>

              <textarea
                readOnly
                value={aiPrompts}
                className="w-full h-48 p-3 text-xs font-mono bg-[#0b0c10] border border-orange/30 rounded-lg text-text-muted resize-y focus:outline-none focus:border-orange"
              />

              <div className="flex items-center gap-2 flex-wrap mt-2.5">
                <button
                  onClick={handleCopyAllPrompts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-orange/20 border border-orange/40 text-orange hover:-translate-y-0.5 transition-all"
                >
                  {isAllPromptsCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green" />
                      <span>✓ Todos Prompts Copiados!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>📋 Copiar Todos os Prompts</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleCopyMusicPrompts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-cyan/15 border border-cyan/40 text-cyan hover:-translate-y-0.5 transition-all"
                >
                  {isMusicCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green" />
                      <span>✓ Prompts de Música Copiados!</span>
                    </>
                  ) : (
                    <>
                      <Music className="w-3.5 h-3.5 text-cyan" />
                      <span>🎵 Copiar Música & Sons (Google Flow)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PASSO 3: IMAGENS */}
        <div
          className={`bg-surface border rounded-xl p-4 mb-4 transition-all ${!step1Done
              ? 'opacity-40 pointer-events-none'
              : step3Done
                ? 'border-green/40'
                : 'border-accent/40 shadow-[0_0_16px_rgba(255,34,68,0.12)]'
            }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border ${step3Done
                  ? 'bg-green border-green text-[#04220f]'
                  : 'bg-surface-el border-accent text-accent'
                }`}
            >
              3
            </div>
            <div className="text-xs font-extrabold tracking-wider uppercase text-text">
              Mídias (Imagens & Vídeos do LCTNET FLOW)
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-0 text-xs text-text-muted truncate">
              {imageFiles.length > 0
                ? `${imageFiles.filter((m) => m.type !== 'video').length} imagens e ${
                    imageFiles.filter((m) => m.type === 'video').length
                  } vídeos carregados`
                : 'Nenhuma mídia selecionada'}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-surface-el border border-border-strong text-text cursor-pointer hover:-translate-y-0.5 transition-all">
                <ImagePlus className="w-4 h-4 text-cyan" />
                <span>+ Selecionar Imagens</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImagesSelect}
                  className="hidden"
                />
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-surface-el border border-orange/40 text-orange cursor-pointer hover:-translate-y-0.5 transition-all">
                <Film className="w-4 h-4 text-orange" />
                <span>🎬 Selecionar Vídeos</span>
                <input
                  type="file"
                  multiple
                  accept="video/*"
                  onChange={handleVideosSelect}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {imageFolderNote && (
            <div
              className={`text-xs mt-2 font-medium ${imageFolderNote.type === 'ok'
                  ? 'text-green'
                  : imageFolderNote.type === 'warn'
                    ? 'text-orange'
                    : 'text-accent'
                }`}
            >
              {imageFolderNote.msg}
            </div>
          )}

          <div className="text-[11px] text-text-muted/70 mt-2">
            💡 Aceita imagens (<strong className="text-white">.jpg, .png, .webp</strong>) e vídeos (<strong className="text-white">.mp4, .mov, .webm</strong>). Formatos no nome: <strong className="text-white">00-14</strong>, <strong className="text-white">[00-14]</strong>, <strong className="text-white">00_14</strong>, <strong className="text-white">00:14</strong> ou arquivos numerados em ordem.
          </div>
        </div>

        {/* PASSO 4: MONTAR E EXPORTAR CAPCUT ZIP */}
        <div
          className={`bg-surface border rounded-xl p-4 mb-4 transition-all ${!step3Done
              ? 'opacity-40 pointer-events-none'
              : step4Done
                ? 'border-green/40'
                : 'border-accent/40 shadow-[0_0_16px_rgba(255,34,68,0.12)]'
            }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border ${step4Done
                  ? 'bg-green border-green text-[#04220f]'
                  : 'bg-surface-el border-accent text-accent'
                }`}
            >
              4
            </div>
            <div className="text-xs font-extrabold tracking-wider uppercase text-text">
              Montar Vídeo & Baixar Rascunho CapCut (.ZIP)
            </div>
          </div>

          <div className={`glow ${isAssembling ? 'on' : ''}`}>
            <button
              onClick={handleAssembleCapCut}
              disabled={!audioFile || imageFiles.length === 0 || isAssembling}
              className="w-full py-3.5 px-4 rounded-lg font-bold text-sm text-white bg-gradient-to-r from-accent to-orange shadow-[0_0_16px_rgba(255,34,68,0.35)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all hover:brightness-110"
            >
              {isAssembling ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Montando Timeline & Pacote ZIP CapCut...</span>
                </>
              ) : (
                <>
                  <Film className="w-5 h-5" />
                  <span>🎬 Montar e Baixar Pacote CapCut (.ZIP)</span>
                </>
              )}
            </button>
          </div>

          {assembleNote && (
            <div
              className={`text-xs mt-3 font-medium ${assembleNote.type === 'ok'
                  ? 'text-green'
                  : assembleNote.type === 'warn'
                    ? 'text-orange'
                    : 'text-accent'
                }`}
            >
              {assembleNote.msg}
            </div>
          )}

          {downloadUrl && (
            <div className="mt-3">
              <a
                href={downloadUrl}
                download="LctnetVideo_CapCut.zip"
                className="w-full py-2.5 px-4 rounded-lg font-bold text-xs bg-green text-[#04220f] flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-[0_0_12px_rgba(0,255,136,0.3)]"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Pacote CapCut (.ZIP) novamente</span>
              </a>
              <div className="text-[11px] text-text-muted/80 mt-1.5 text-center">
                💡 Basta extrair o conteúdo do arquivo ZIP para a pasta de projetos do CapCut no seu computador!
              </div>
            </div>
          )}
        </div>

        <SupportPix />

        <div className="text-center mt-6 text-[10px] text-text-muted/40">
          © 2025 lctnet.ia · @lctnet.ia · Todos os direitos reservados
        </div>
      </div>
    </div>
  );
}
