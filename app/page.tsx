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

const PASTE_HEADER = `Você é um gerador de prompts de imagem e vídeo para produções cinematográficas em 3D.

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

export default function HomePage() {
  // Step 1 State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [apiKey, setApiKey] = useState<string>('');
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

  useEffect(() => {
    const savedKey = localStorage.getItem('lctnet_gemini_key');
    const envKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    if (savedKey) {
      setApiKey(savedKey);
    } else if (envKey) {
      setApiKey(envKey);
    }
  }, []);

  const handleSaveKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('lctnet_gemini_key', val);
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

    const activeKey = apiKey.trim() || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

    // 1. Direct Browser Client-Side Execution (Bypasses Vercel 10s Serverless Timeout)
    if (activeKey) {
      try {
        const base64Audio = await fileToBase64(audioFile);
        const mimeType = audioFile.type || 'audio/mp3';
        const genAI = new GoogleGenerativeAI(activeKey);

        const candidateModels = [
          'gemini-1.5-flash',
          'gemini-1.5-pro',
          'gemini-2.0-flash-exp',
          'gemini-1.5-flash-8b',
          'gemini-1.0-pro',
          'gemini-pro',
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

        const parsedSegments = rawSegments
          .map((s) => ({
            start: Number(s.start) || 0,
            text: (s.text || '').trim(),
          }))
          .filter((s) => s.text);

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
          msg: `✓ ${parsedSegments.length} segmentos transcritos diretamente no navegador com sucesso!`,
        });
        return;
      } catch (err: any) {
        console.error('Client-side Gemini Error:', err);
        // Fallback to server route if client side fails
      }
    }

    // 2. Server Route Fallback (via Vercel Serverless Function)
    if (audioFile.size > 4.5 * 1024 * 1024) {
      setIsTranscribing(false);
      setTranscribeNote({
        type: 'err',
        msg: `⚠ O arquivo de áudio (${(audioFile.size / (1024 * 1024)).toFixed(1)}MB) excede o limite da Vercel (4.5MB). Cole sua Chave Gemini no campo acima para transcrever diretamente no navegador sem limites!`,
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      if (apiKey) formData.append('apiKey', apiKey);

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
            errorMsg = 'O tempo de resposta excedeu o limite de 10s da Vercel. Informe sua Chave Gemini API no campo acima para transcrever áudios longos diretamente no seu navegador sem limitações!';
          } else if (res.status === 413) {
            errorMsg = 'O arquivo de áudio excede o limite da Vercel (4.5MB). Cole sua Chave Gemini no campo acima para processar diretamente no navegador.';
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
          msg: `✓ ${data.count} segmentos transcritos com sucesso!`,
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

  const handleGenPromptsAI = async () => {
    if (!srtText) return;
    setIsGenPrompts(true);
    const activeKey = apiKey.trim() || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

    if (activeKey) {
      try {
        const genAI = new GoogleGenerativeAI(activeKey);
        const candidateModels = [
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-2.0-flash-exp',
          'gemini-1.0-pro',
          'gemini-pro',
        ];
        const userPrompt = `You are an elite AI prompt engineer specialized in 3D cinematic photorealistic visual storytelling.
Your task is to analyze the provided transcript with timestamps and generate paired Image and Video prompts IN ENGLISH for every scene/timestamp.

Format per scene:
[MM:SS] SCENE [X] — [Title]

Image (Nano Banana 2): [Detailed 3D photorealistic image prompt in English... cinematic photorealism 4K, high dramatic contrast.]

Video (Veo 3.1 Lite): [Camera movement, character action/breathing, lighting, sound description, X seconds.]

Generate one image prompt per timestamp:

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

  const handleImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const pat = /\[(\d{1,2})-(\d{2})\]/;
    const parsed: SceneImage[] = [];

    files.forEach((f) => {
      if (/\.(jpg|jpeg|png|webp)$/i.test(f.name)) {
        const m = pat.exec(f.name);
        if (m) {
          const ts = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
          parsed.push({
            name: f.name,
            timestamp: ts,
            file: f,
          });
        }
      }
    });

    if (parsed.length > 0) {
      parsed.sort((a, b) => a.timestamp - b.timestamp);
      setImageFiles(parsed);
      setImageFolderNote({
        type: 'ok',
        msg: `✓ ${parsed.length} imagens com timestamp [MM-SS] selecionadas`,
      });
    } else {
      setImageFolderNote({
        type: 'warn',
        msg: '⚠ Nenhuma imagem com formato [MM-SS] no nome encontrada.',
      });
    }
  };

  const handleAssembleCapCut = async () => {
    if (!audioFile || imageFiles.length === 0) return;
    setIsAssembling(true);
    setAssembleNote(null);

    try {
      const projectName = `LctnetVideo_${audioFile.name.replace(/\.[^/.]+$/, '').slice(0, 16)}`;
      const zipBlob = await generateCapCutZip(
        projectName,
        audioFile,
        audioDuration || 60,
        imageFiles
      );

      const url = URL.createObjectURL(zipBlob);
      setDownloadUrl(url);
      setIsAssembling(false);

      setAssembleNote({
        type: 'ok',
        msg: `✓ ${imageFiles.length} cenas montadas! Arquivo .ZIP do CapCut gerado.`,
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

  const step1Done = !!segments.length;
  const step2Done = !!segments.length;
  const step3Done = imageFiles.length > 0;
  const step4Done = !!downloadUrl;

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
              Áudio & Chave Gemini API
            </div>
          </div>

          {/* Gemini Key Input */}
          <div className="mb-3">
            <label className="text-[11px] text-text-muted flex items-center justify-between mb-1 font-semibold">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber" /> Chave Gemini API (Google Gemini Pro):
              </span>
              <span className="text-[10px] text-green font-normal">
                {apiKey ? '✓ Salva no navegador' : '⚡ Recomendado para áudios longos'}
              </span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              placeholder="Cole sua AI_KEY_... (ou defina no ambiente)"
              className="w-full px-3 py-2 text-xs font-mono bg-surface-el border border-border-strong rounded-lg text-text focus:outline-none focus:border-accent"
            />
            <div className="text-[10px] text-text-muted/70 mt-1">
              💡 Cole sua chave 1 vez. Ela fica salva no seu navegador para transcrever áudios longos sem limite de tempo!
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-0 text-xs text-text-muted truncate">
              {audioFile ? audioFile.name : 'Nenhum arquivo selecionado'}
            </span>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-surface-el border border-border-strong text-text cursor-pointer hover:-translate-y-0.5 transition-all">
              <FileAudio className="w-4 h-4 text-accent" />
              <span>Selecionar áudio</span>
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
                  <span>Transcrevendo com Gemini Pro...</span>
                </>
              ) : (
                <>
                  <span>▶ Transcrever com Gemini Pro</span>
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
          </div>

          <textarea
            readOnly
            value={srtText}
            placeholder="A transcrição com timestamps aparece aqui..."
            className="w-full h-36 p-3 text-xs font-mono bg-surface-el border border-border-strong rounded-lg text-text resize-y focus:outline-none"
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
              onClick={handleGenPromptsAI}
              disabled={!srtText || isGenPrompts}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-orange/15 border border-orange/40 text-orange ml-auto hover:-translate-y-0.5 transition-all disabled:opacity-30"
            >
              {isGenPrompts ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>✨ Gerar Prompts via Gemini Pro</span>
            </button>
          </div>
          <div className="text-[11px] text-text-muted/70 mt-2">
            💡 Dica: Prompts gerados no estilo <strong className="text-white">3D cinematic photorealism 4K</strong> com entradas pareadas para <strong className="text-white">Image (Nano Banana 2)</strong> e <strong className="text-white">Video (Veo 3.1 Lite)</strong> em inglês.
          </div>
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
              Imagens (do LCTNET FLOW)
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-0 text-xs text-text-muted truncate">
              {imageFiles.length > 0
                ? `${imageFiles.length} imagens com timestamp carregadas`
                : 'Nenhuma imagem selecionada'}
            </span>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-surface-el border border-border-strong text-text cursor-pointer hover:-translate-y-0.5 transition-all">
              <ImagePlus className="w-4 h-4 text-cyan" />
              <span>Selecionar Imagens</span>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImagesSelect}
                className="hidden"
              />
            </label>
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
