'use client';

import React from 'react';
import { Film, Sparkles } from 'lucide-react';

export function HeroHeader() {
  return (
    <div className="flex items-center gap-4 mb-6 pt-4">
      <div className="relative flex-shrink-0">
        <div className="w-14 h-14 rounded-full bg-surface-el border-2 border-accent flex items-center justify-center shadow-[0_0_15px_rgba(255,34,68,0.55)]">
          <Film className="w-7 h-7 text-accent" />
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-wider bg-gradient-to-r from-white via-orange to-accent bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,34,68,0.3)]">
          LCTNET VIDEO MAKER
        </h1>
        <div className="text-[11px] text-text-muted tracking-widest font-semibold mt-1 flex items-center gap-2">
          <span>ÁUDIO → TRANSCRIÇÃO → PROMPTS → IMAGENS → CAPCUT</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[10px]">
            <Sparkles className="w-3 h-3" /> Web App
          </span>
        </div>
      </div>
    </div>
  );
}
