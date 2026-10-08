import { anthropicClient } from '@/lib/ai/anthropic';

/** Antworten des Akademie-Bots: günstiges Modell, kurzer Kontext */
export const AKADEMIE_BOT_MODELL = process.env.AKADEMIE_BOT_MODEL || 'claude-haiku-4-5';
/** Wissen einspeisen → Entwürfe: gründliches Modell, läuft selten */
export const AKADEMIE_IMPORT_MODELL = process.env.AKADEMIE_IMPORT_MODEL || 'claude-opus-5-5';

export interface KiAnfrage {
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}

/** Austauschbar für Tests */
export type KiFn = (a: KiAnfrage) => Promise<string>;

export const standardKi: KiFn = async ({ model, system, prompt, maxTokens }) => {
  const res = await anthropicClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = res.content.find((b) => b.type === 'text');
  return block && 'text' in block ? block.text : '';
};

/** Wie KiFn, zusätzlich mit Standbildern (JPEG/PNG, base64) – für SOPs aus Bildschirmaufnahmen */
export type KiBildFn = (a: KiAnfrage & { bilder: Array<{ base64: string; mime: 'image/jpeg' | 'image/png' }> }) => Promise<string>;

export const standardKiMitBildern: KiBildFn = async ({ model, system, prompt, maxTokens, bilder }) => {
  const res = await anthropicClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: 'user',
        content: [
          ...bilder.map((b) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: b.mime, data: b.base64 } })),
          { type: 'text' as const, text: prompt },
        ],
      },
    ],
  });
  const block = res.content.find((b) => b.type === 'text');
  return block && 'text' in block ? block.text : '';
};
