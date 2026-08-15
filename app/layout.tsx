import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LCTNET VIDEO MAKER — Gerador de Vídeos Explainer & CapCut',
  description: 'Áudio → Transcrição com Gemini Pro → Prompts IA → Imagens LCTNET FLOW → Timeline CapCut sincronizada.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
