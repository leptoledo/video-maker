'use client';

import React, { useState } from 'react';
import { Heart, Copy, Check } from 'lucide-react';

const PIX_CODE = "00020126580014BR.GOV.BCB.PIX01360d7c6d0d-599a-4d40-b896-6b8e1e07ec9e5204000053039865802BR5923Lctnet Machado de Bonfim6009SAO PAULO62140510v41WD6P5j76304D870";
const PIX_PATH = "M0 0h7v1h-7zM13 0h2v1h-2zM16 0h1v1h-1zM20 0h2v1h-2zM23 0h1v1h-1zM25 0h2v1h-2zM28 0h1v1h-1zM30 0h2v1h-2zM35 0h1v1h-1zM42 0h1v1h-1zM46 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM9 1h2v1h-2zM12 1h1v1h-1zM16 1h1v1h-1zM19 1h1v1h-1zM21 1h1v1h-1zM26 1h2v1h-2zM29 1h1v1h-1zM31 1h1v1h-1zM35 1h1v1h-1zM37 1h1v1h-1zM39 1h1v1h-1zM42 2h2v1h-2zM46 1h1v1h-1zM52 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h1v1h-1zM11 2h1v1h-1zM18 2h1v1h-1zM20 2h2v1h-2zM23 2h1v1h-1zM25 2h2v1h-2zM29 2h2v1h-2zM32 2h1v1h-1zM36 2h2v1h-2zM39 2h1v1h-1zM43 2h1v1h-1zM46 2h1v1h-1zM48 2h3v1h-3zM52 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM8 3h1v1h-1zM12 3h1v1h-1zM15 3h2v1h-2zM20 3h1v1h-1zM23 3h2v1h-2zM27 3h1v1h-1zM30 3h1v1h-1zM33 3h3v1h-3zM42 3h1v1h-1zM44 3h1v1h-1zM46 3h1v1h-1zM48 3h3v1h-3zM52 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM8 4h1v1h-1zM10 4h2v1h-2zM13 4h1v1h-1zM16 4h2v1h-2zM19 4h12v1h-12zM32 4h2v1h-2zM37 4h1v1h-1zM40 4h3v1h-3zM46 4h1v1h-1zM48 4h3v1h-3zM52 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h2v1h-2zM11 5h2v1h-2zM24 5h1v1h-1zM28 5h1v1h-1zM33 5h3v1h-3zM39 5h1v1h-1zM41 5h2v1h-2zM46 5h1v1h-1zM52 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM26 6h1v1h-1zM28 6h1v1h-1zM30 6h1v1h-1zM32 6h1v1h-1zM34 6h1v1h-1zM36 6h1v1h-1zM38 6h1v1h-1zM40 6h1v1h-1zM42 6h1v1h-1zM44 6h1v1h-1zM46 6h7v1h-7z";

export function SupportPix() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PIX_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="bg-surface border border-green/30 rounded-xl p-4 mt-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-green/10 border border-green/40 flex items-center justify-center text-green text-xs font-bold">
          <Heart className="w-3.5 h-3.5" />
        </div>
        <div className="text-xs font-extrabold tracking-wider uppercase text-text">
          Gostou? Apoie o canal
        </div>
      </div>
      <div className="flex flex-wrap gap-4 items-center">
        <div className="w-32 h-32 bg-white rounded-lg p-2 flex-shrink-0 shadow-[0_0_18px_rgba(0,255,136,0.18)]">
          <svg viewBox="-2 -2 57 57" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="-2" y="-2" width="57" height="57" fill="#ffffff"/>
            <path fill="#0b0b14" d={PIX_PATH}/>
          </svg>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs font-bold text-green tracking-wide mb-1">
            Pix · lctnet.ia
          </div>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            Esse programa é <strong className="text-white">100% grátis</strong>. Se ele te ajudou, contribua com qualquer valor via Pix pra manter o canal e novas ferramentas no ar. 🙏
          </p>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-green text-[#04220f] hover:brightness-110 transition-all shadow-[0_0_12px_rgba(0,255,136,0.3)]"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Chave Pix Copiada!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar chave Pix (copia e cola)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
