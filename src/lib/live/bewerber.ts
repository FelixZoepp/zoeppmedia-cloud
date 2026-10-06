/** Live-Hinweis „Neuer Bewerber“: reine Zuordnung, getrennt vom Laden (testbar). */

export interface LiveBewerber {
  id: string;
  name: string;
  created_at: string;
  quelle: string;
  stelle: string | null;
  agency: { id: string; name: string; logo_url: string | null };
}

const QUELLEN: Record<string, string> = {
  meta: 'Meta-Anzeige',
  facebook: 'Meta-Anzeige',
  instagram: 'Meta-Anzeige',
  indeed: 'Indeed',
  indeed_csv: 'Indeed',
  indeed_email: 'Indeed',
  form: 'Formular',
  formular: 'Formular',
  website: 'Formular',
  manual: 'Manuell',
  manuell: 'Manuell',
  csv: 'CSV-Import',
  import: 'CSV-Import',
  whatsapp: 'WhatsApp',
  whatsapp_inbound: 'WhatsApp',
};

export function quelleLabel(source: string | null | undefined): string {
  if (!source) return 'Unbekannt';
  const key = source.toLowerCase();
  return QUELLEN[key] ?? (key.startsWith('indeed') ? 'Indeed' : key.startsWith('meta') ? 'Meta-Anzeige' : source.charAt(0).toUpperCase() + source.slice(1));
}

/** Zeitpunkt, ab dem gesucht wird: höchstens 10 Min. zurück, Standard 2 Min. */
export function klemmeSeit(seit: string | null | undefined, jetzt: Date): string {
  const min = jetzt.getTime() - 10 * 60_000;
  const t = seit ? Date.parse(seit) : NaN;
  if (Number.isNaN(t)) return new Date(jetzt.getTime() - 2 * 60_000).toISOString();
  return new Date(Math.min(jetzt.getTime(), Math.max(min, t))).toISOString();
}

type Zeile = {
  id: string;
  name: string | null;
  created_at: string;
  source: string | null;
  indeed_job_title: string | null;
  meta_campaign: string | null;
  agency_id: string;
};

export function bauLiveBewerber(
  zeilen: Zeile[],
  stellen: Map<string, string>,
  agencies: Map<string, { name: string; logo_url: string | null }>,
): LiveBewerber[] {
  return [...zeilen]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-10)
    .map((z) => ({
      id: z.id,
      name: z.name?.trim() || 'Unbekannt',
      created_at: z.created_at,
      quelle: quelleLabel(z.source),
      stelle: stellen.get(z.id) ?? z.indeed_job_title ?? z.meta_campaign ?? null,
      agency: { id: z.agency_id, name: agencies.get(z.agency_id)?.name ?? 'Kunde', logo_url: agencies.get(z.agency_id)?.logo_url ?? null },
    }));
}

/** Ziel von „Ansehen“ je nach Rolle */
export function ansehenLink(
  b: Pick<LiveBewerber, 'id' | 'agency'>,
  user: { role: string; funktion?: string | null },
): string {
  if (user.role.startsWith('agency_')) return `/candidates/${b.id}`;
  if (user.role === 'employee' && user.funktion === 'csm') return `/clients/${b.agency.id}`;
  return `/api/admin/impersonate?agency=${b.agency.id}&ziel=${encodeURIComponent(`/candidates/${b.id}`)}`;
}

/** Wer bekommt den Live-Hinweis? Kunden für sich, intern Admins, Innendienst und Kundenberater */
export function siehtLiveBewerber(user: { role: string; funktion?: string | null }): boolean {
  if (user.role.startsWith('agency_') || user.role === 'admin') return true;
  return user.role === 'employee' && ['innendienst', 'csm'].includes(user.funktion ?? '');
}

/** „gerade eben“ / „vor 2 Min.“ / „vor 1 Std.“ */
export function wannText(iso: string, jetzt: number): string {
  const min = Math.floor((jetzt - Date.parse(iso)) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  return `vor ${Math.floor(min / 60)} Std.`;
}
