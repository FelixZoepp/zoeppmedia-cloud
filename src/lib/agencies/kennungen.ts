import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** URL-Slug aus dem Firmennamen (wie Migration 20260921000001: nur a-z, 0-9, Bindestriche). */
export function slugAusName(name: string): string {
  const basis = name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return basis || 'kunde';
}

/**
 * Pflichtkennungen für eine neue Agentur: eindeutiger Slug + zufälliger Indeed-Feed-Key.
 * Beide Spalten sind NOT NULL ohne Default – ohne sie scheitert jede Neuanlage.
 */
export async function neueAgenturKennungen(
  admin: SupabaseClient,
  name: string
): Promise<{ slug: string; indeed_feed_key: string }> {
  const basis = slugAusName(name);
  const { data } = await admin.from('agencies').select('slug').like('slug', `${basis}%`);
  const vergeben = new Set((data ?? []).map((a: { slug: string }) => a.slug));

  let slug = basis;
  for (let i = 2; vergeben.has(slug); i++) slug = `${basis}-${i}`;

  return { slug, indeed_feed_key: randomBytes(24).toString('hex') };
}
