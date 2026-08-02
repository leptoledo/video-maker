import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface ProjectRecord {
  id: string;
  name: string;
  audio_url?: string;
  transcription?: Array<{ start: number; text: string }>;
  paste_prompt?: string;
  created_at: string;
}
