'use client';

import React, { useState, useEffect } from 'react';
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
    if (savedKey) setApiKey(savedKey);
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

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      if (apiKey) formData.append('apiKey', apiKey);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

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
    try {
      const res = await fetch('/api/gen_prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srt: srtText, apiKey }),
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
          className={`bg-surface border rounded-xl p-4 mb-4 transition-all ${
            step1Done ? 'border-green/40' : 'border-accent/40 shadow-[0_0_16px_rgba(255,34,68,0.12)]'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border ${
                step1Done
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
            <label className="text-[11px] text-text-muted flex items-center gap-1.5 mb-1 font-semibold">
              <Key className="w-3.5 h-3.5 text-amber" /> Chave Gemini API (Google Gemini Pro):
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              placeholder="Cole sua AI_KEY_... (ou defina no ambiente)"
              className="w-full px-3 py-2 text-xs font-mono bg-surface-el border border-border-strong rounded-lg text-text focus:outline-none focus:border-accent"
            />
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
              className={`text-xs mt-2 font-medium ${
                transcribeNote.type === 'ok'
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
          className={`bg-surface border rounded-xl p-4 mb-4 transition-all ${
            !step1Done
              ? 'opacity-40 pointer-events-none'
              : step2Done
              ? 'border-green/40'
              : 'border-accent/40 shadow-[0_0_16px_rgba(255,34,68,0.12)]'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border ${
                step2Done
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
          className={`bg-surface border rounded-xl p-4 mb-4 transition-all ${
            !step1Done
              ? 'opacity-40 pointer-events-none'
              : step3Done
              ? 'border-green/40'
              : 'border-accent/40 shadow-[0_0_16px_rgba(255,34,68,0.12)]'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border ${
                step3Done
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
              className={`text-xs mt-2 font-medium ${
                imageFolderNote.type === 'ok'
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
          className={`bg-surface border rounded-xl p-4 mb-4 transition-all ${
            !step3Done
              ? 'opacity-40 pointer-events-none'
              : step4Done
              ? 'border-green/40'
              : 'border-accent/40 shadow-[0_0_16px_rgba(255,34,68,0.12)]'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border ${
                step4Done
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
              className={`text-xs mt-3 font-medium ${
                assembleNote.type === 'ok'
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
          © 2025 lctnet.ia · @lctnetmachadoIA · Todos os direitos reservados
        </div>
      </div>
    </div>
  );
}
