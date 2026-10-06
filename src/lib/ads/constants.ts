/** Ads-Ablauf: Konstanten und Typen (ohne Server-Imports, auch im Browser nutzbar). */

export type AdStage = 'idee' | 'material' | 'bearbeitung' | 'freigabe_kunde' | 'bereit' | 'live' | 'verworfen';
export type AdTyp = 'grafik' | 'video' | 'reel' | 'karussell' | 'indeed';

export const AD_STAGES: Array<{ key: AdStage; label: string; hinweis: string; dot: string }> = [
  { key: 'idee', label: 'Idee', hinweis: 'Hook, Winkel, Format festhalten', dot: 'bg-gray-400' },
  { key: 'material', label: 'Material', hinweis: 'Grafik bauen / Rohvideo vom Kunden', dot: 'bg-violet-500' },
  { key: 'bearbeitung', label: 'Bearbeitung', hinweis: 'Schnitt, Design, Text', dot: 'bg-sky-500' },
  { key: 'freigabe_kunde', label: 'Freigabe Kunde', hinweis: 'liegt beim Kunden im Portal', dot: 'bg-amber-500' },
  { key: 'bereit', label: 'Bereit zum Launch', hinweis: 'freigegeben – live schalten', dot: 'bg-green-500' },
  { key: 'live', label: 'Live', hinweis: 'läuft im Werbemanager', dot: 'bg-emerald-700' },
];

export const AD_TYPEN: Array<{ key: AdTyp; label: string }> = [
  { key: 'grafik', label: 'Grafik' },
  { key: 'video', label: 'Video' },
  { key: 'reel', label: 'Reel' },
  { key: 'karussell', label: 'Karussell' },
  { key: 'indeed', label: 'Indeed-Anzeige' },
];

export const AD_ASSET_BUCKET = 'ad-assets';

export interface AdItem {
  id: string;
  agency_id: string;
  titel: string;
  idee: string | null;
  typ: AdTyp;
  stage: AdStage;
  assignee_id: string | null;
  faellig_am: string | null;
  material_urls: string[];
  asset_path: string | null;
  asset_url: string | null;
  kunden_kommentar: string | null;
  /** strukturierter Inhalt, z. B. bei Indeed-Anzeigen */
  inhalt?: Record<string, unknown> | null;
  freigegeben_am: string | null;
  live_am: string | null;
  created_at: string;
  updated_at: string;
}

