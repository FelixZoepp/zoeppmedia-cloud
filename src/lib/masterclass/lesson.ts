import { z } from 'zod';

/** Masterclass-Lektion inkl. der neuen Felder (Migration 20261005000001). Fehlende Spalten → Standardwerte. */
export interface Kapitel {
  sekunden: number;
  titel: string;
}

export interface Anhang {
  name: string;
  url: string;
  art: 'datei' | 'link';
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  video_provider: 'youtube' | 'vimeo' | 'loom' | null;
  duration_minutes: number | null;
  sort_order: number;
  status: 'entwurf' | 'veroeffentlicht';
  typ: 'video' | 'text';
  content_html: string | null;
  tags: string[];
  thumbnail_url: string | null;
  kapitel: Kapitel[];
  anhaenge: Anhang[];
  pflicht: boolean;
  kein_vorzeitiges_abschliessen: boolean;
  mit_ki_erstellt: boolean;
}

export interface Module {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  published: boolean;
}

/** Spalten, die erst mit der Migration existieren */
export const NEW_LESSON_COLUMNS = [
  'status',
  'typ',
  'content_html',
  'tags',
  'thumbnail_url',
  'kapitel',
  'anhaenge',
  'pflicht',
  'kein_vorzeitiges_abschliessen',
  'mit_ki_erstellt',
] as const;

export function normalizeLesson(row: Record<string, unknown>): Lesson {
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    id: String(row.id),
    module_id: String(row.module_id),
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    video_provider: (row.video_provider as Lesson['video_provider']) ?? null,
    duration_minutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : null,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    status: row.status === 'entwurf' ? 'entwurf' : 'veroeffentlicht',
    typ: row.typ === 'text' ? 'text' : 'video',
    content_html: (row.content_html as string | null) ?? null,
    tags: arr<string>(row.tags),
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    kapitel: arr<Kapitel>(row.kapitel).filter((k) => typeof k?.sekunden === 'number' && typeof k?.titel === 'string'),
    anhaenge: arr<Anhang>(row.anhaenge).filter((a) => typeof a?.url === 'string' && typeof a?.name === 'string'),
    pflicht: row.pflicht === true,
    kein_vorzeitiges_abschliessen: row.kein_vorzeitiges_abschliessen === true,
    mit_ki_erstellt: row.mit_ki_erstellt === true,
  };
}

/* ── Video ─────────────────────────────────────────────────────── */

/** Anbieter aus der URL erkennen */
export function detectProvider(url: string): 'youtube' | 'vimeo' | 'loom' | null {
  if (/youtu\.?be/.test(url)) return 'youtube';
  if (/vimeo\.com/.test(url)) return 'vimeo';
  if (/loom\.com/.test(url)) return 'loom';
  return null;
}

/** Einbett-URL für YouTube/Vimeo/Loom, optional mit Startzeit (Kapitel) */
export function videoEmbedUrl(url: string | null, start = 0): string | null {
  if (!url) return null;
  const s = Math.max(0, Math.floor(start));
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0${s ? `&start=${s}&autoplay=1` : ''}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}${vimeo[2] ? `?h=${vimeo[2]}` : ''}${s ? `${vimeo[2] ? '&' : '?'}autoplay=1#t=${s}s` : ''}`;
  const loom = url.match(/loom\.com\/(?:share|embed)\/([\w]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}${s ? `?t=${s}` : ''}`;
  return null;
}

/** 75 → „1:15“, 3725 → „1:02:05“ */
export function formatZeit(sek: number): string {
  const h = Math.floor(sek / 3600);
  const m = Math.floor((sek % 3600) / 60);
  const s = Math.floor(sek % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** „1:15“ / „01:02:05“ / „75“ → Sekunden, sonst null */
export function parseZeit(text: string): number | null {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/* ── HTML-Inhalt ───────────────────────────────────────────────── */

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'a', 'hr']);
const VOID = new Set(['br', 'hr']);

function escapeText(s: string): string {
  return s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeHref(raw: string): string | null {
  const v = raw.replace(/&amp;/g, '&').trim();
  if (/^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v) || /^mailto:/i.test(v)) return v.replace(/"/g, '%22');
  return null;
}

/**
 * Strenger Allowlist-Filter für Lektionsinhalt: nur einfache Formatierungs-Tags, keine Attribute außer
 * sicherem href an Links. Alles andere (Skripte, Styles, Event-Handler, unbekannte Tags) fällt weg bzw.
 * wird als Text maskiert. Inhalte von <script>/<style> werden komplett entfernt.
 */
export function sanitizeLessonHtml(input: string): string {
  const html = input.replace(/<(script|style|iframe|object|embed|template|noscript)[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const out: string[] = [];
  const open: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(escapeText(html.slice(last, m.index)));
    last = m.index + m[0].length;
    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    if (!ALLOWED.has(tag)) continue;
    if (closing) {
      const idx = open.lastIndexOf(tag);
      if (idx === -1) continue;
      while (open.length > idx) out.push(`</${open.pop()}>`);
      continue;
    }
    if (VOID.has(tag)) {
      out.push(`<${tag}>`);
      continue;
    }
    if (tag === 'a') {
      const hrefMatch = m[2].match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefMatch ? safeHref(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '') : null;
      out.push(href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : '<a>');
    } else {
      out.push(`<${tag}>`);
    }
    open.push(tag);
  }
  out.push(escapeText(html.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('').trim();
}

/* ── Validierung beim Speichern ────────────────────────────────── */

const httpUrl = z.string().trim().max(1000).regex(/^https?:\/\//, 'Bitte eine vollständige URL mit https:// angeben');

export const lessonPatchSchema = z
  .object({
    title: z.string().trim().min(1, 'Name fehlt').max(200),
    module_id: z.string().uuid(),
    description: z.string().max(2000).nullable(),
    video_url: httpUrl.nullable(),
    duration_minutes: z.number().int().min(0).max(600).nullable(),
    status: z.enum(['entwurf', 'veroeffentlicht']),
    typ: z.enum(['video', 'text']),
    content_html: z.string().max(100_000).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    thumbnail_url: httpUrl.nullable(),
    kapitel: z.array(z.object({ sekunden: z.number().int().min(0).max(86_400), titel: z.string().trim().min(1).max(120) })).max(60),
    anhaenge: z.array(z.object({ name: z.string().trim().min(1).max(160), url: httpUrl, art: z.enum(['datei', 'link']) })).max(30),
    pflicht: z.boolean(),
    kein_vorzeitiges_abschliessen: z.boolean(),
    mit_ki_erstellt: z.boolean(),
  })
  .partial();

export type LessonPatch = z.infer<typeof lessonPatchSchema>;

/** Patch für die Datenbank vorbereiten: HTML filtern, Anbieter ableiten, Kapitel sortieren */
export function prepareLessonPatch(patch: LessonPatch, schemaReady: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = { ...patch };
  if (patch.video_url !== undefined) row.video_provider = patch.video_url ? (detectProvider(patch.video_url) ?? 'youtube') : 'youtube';
  if (patch.content_html !== undefined) row.content_html = patch.content_html ? sanitizeLessonHtml(patch.content_html) : null;
  if (patch.kapitel) row.kapitel = [...patch.kapitel].sort((a, b) => a.sekunden - b.sekunden);
  if (patch.tags) row.tags = [...new Set(patch.tags)];
  if (!schemaReady) {
    for (const c of NEW_LESSON_COLUMNS) delete row[c];
    // Loom kennt die alte Datenbank noch nicht
    if (row.video_provider === 'loom') row.video_provider = 'youtube';
  } else {
    row.updated_at = new Date().toISOString();
  }
  return row;
}
