import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { canWriteRole } from '@/lib/recruiting/scope';
import { ladeEinstellungen, ladeRoiUebersicht } from '@/lib/roi/laden';

const MONAT = /^\d{4}-\d{2}-01$/;

/** GET: eingestellte Vertriebler mit Monatsumsätzen, ROI und fehlenden Pflicht-Einträgen der geöffneten Kunden-Cloud */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: isInternal(user.role) ? 'Bitte zuerst eine Kunden-Cloud öffnen' : 'Keine Agentur zugeordnet' }, { status: 400 });
  const daten = await ladeRoiUebersicht(createAdminClient(), agencyId);
  return NextResponse.json({ ...daten, schreiben: canWriteRole(user.role) });
}

interface Eintrag {
  candidate_id?: unknown;
  monat?: unknown;
  umsatz?: unknown;
  provision?: unknown;
  aktiv?: unknown;
  notiz?: unknown;
}

const zahl = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  // Zahl oder deutsches Format („6.000,50“)
  const t = String(v).trim();
  const n = typeof v === 'number' ? v : Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : NaN;
};

/** POST/PUT { eintraege: [{ candidate_id, monat (YYYY-MM-01), umsatz, provision?, aktiv?, notiz? }] } – speichern (Upsert je Vertriebler und Monat) */
async function speichern(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Nur lesender Zugriff' }, { status: 403 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur zugeordnet' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { eintraege?: Eintrag[] } & Eintrag;
  const liste = Array.isArray(body.eintraege) ? body.eintraege : [body];
  if (!liste.length || liste.length > 200) return NextResponse.json({ error: 'Keine Einträge' }, { status: 400 });

  const svc = createAdminClient();
  const erlaubt = new Set((await ladeEinstellungen(svc, agencyId)).map((h) => h.id));
  const heute = new Date().toISOString().slice(0, 7) + '-01';

  const zeilen = [];
  for (const e of liste) {
    const candidateId = typeof e.candidate_id === 'string' ? e.candidate_id : '';
    const monat = typeof e.monat === 'string' ? e.monat : '';
    if (!erlaubt.has(candidateId)) return NextResponse.json({ error: 'Vertriebler gehört nicht zu dieser Agentur oder ist nicht eingestellt' }, { status: 400 });
    if (!MONAT.test(monat) || monat > heute) return NextResponse.json({ error: 'Ungültiger Monat' }, { status: 400 });
    const umsatz = zahl(e.umsatz);
    const provision = zahl(e.provision);
    if (umsatz === null || Number.isNaN(umsatz) || Number.isNaN(provision)) return NextResponse.json({ error: 'Bitte gültige Beträge eintragen' }, { status: 400 });
    zeilen.push({
      agency_id: agencyId,
      candidate_id: candidateId,
      monat,
      umsatz,
      provision,
      aktiv: e.aktiv === undefined ? true : e.aktiv === true,
      notiz: typeof e.notiz === 'string' ? e.notiz.slice(0, 500) : null,
      eingetragen_von: user.id,
      updated_at: new Date().toISOString(),
    });
  }

  const { error } = await svc.from('vertriebler_umsaetze').upsert(zeilen, { onConflict: 'candidate_id,monat' });
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  return NextResponse.json({ ok: true, gespeichert: zeilen.length });
}

export const POST = speichern;
export const PUT = speichern;
