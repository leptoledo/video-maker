'use client';

import React, { useState } from 'react';
import { Heart, Copy, Check } from 'lucide-react';

const PIX_CODE = "00020126580014BR.GOV.BCB.PIX01360d7c6d0d-599a-4d40-b896-6b8e1e07ec9e5204000053039865802BR5923Lctnet Machado de Bonfim6009SAO PAULO62140510v41WD6P5j76304D870";

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
          GOSTOU? APOIE O APP
        </div>
      </div>
      <div className="flex flex-wrap gap-4 items-center">
        <div className="w-32 h-32 bg-surface-el rounded-lg p-1.5 flex-shrink-0 shadow-[0_0_18px_rgba(0,255,136,0.18)] border border-border-strong overflow-hidden">
          <img
            src="/qr-code.jpg"
            alt="QR Code Pix"
            className="w-full h-full object-cover rounded-md"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs font-bold text-green tracking-wide mb-1">
            (@leptoledo)
          </div>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            Esse programa é <strong className="text-white">100% grátis</strong>. Se ele te ajudou, contribua com qualquer valor via Pix pra manter o app e novas ferramentas no ar. 🙏
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
