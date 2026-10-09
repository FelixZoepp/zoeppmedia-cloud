/** Video-Freigabe – Konstanten, auch im Browser nutzbar */

export const VIDEO_BUCKET = 'videos';
/** Supabase Free-Plan: max. 50 MB pro Datei (mit Pro-Plan anheben) */
export const MAX_VIDEO_MB = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB) || 50;
/** Höchstzahl Standbilder für die KI-Prüfung (Browser zieht sie, Server prüft) */
export const MAX_STANDBILDER = 40;

export const VIDEO_ARTEN = { ad: 'Ad', website: 'Website-Video', reel: 'Reel', sonstiges: 'Sonstiges' } as const;
export type VideoArt = keyof typeof VIDEO_ARTEN;

export const VIDEO_STATUS = { in_pruefung: 'Zu prüfen', aenderungen: 'Änderungen nötig', freigegeben: 'Freigegeben' } as const;
export type VideoStatus = keyof typeof VIDEO_STATUS;

/** 75.4 → „1:15“ */
export function zeitText(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return '–';
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Dateiname für den Storage-Pfad (keine Umlaute/Sonderzeichen) */
export function sichererDateiname(name: string): string {
  const basis = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return basis.slice(-80) || 'video.mp4';
}

export interface KiFund {
  zeit: number;
  text: string;
  problem: string;
  vorschlag: string;
  art: 'rechtschreibung' | 'grammatik' | 'zeichensetzung' | 'inhalt';
}

export interface KiVideoErgebnis {
  zusammenfassung: string;
  funde: KiFund[];
  texte: Array<{ zeit: number; text: string }>;
  bilder: number;
  am: string;
}
