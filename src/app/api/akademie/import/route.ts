import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { erzeugeEntwuerfe, textAusAudio, textAusDatei, textAusGespraech, type ImportArt } from '@/lib/akademie/import';

export const maxDuration = 300;

const MAX_DATEI = 25 * 1024 * 1024;

/**
 * POST (multipart) – Wissen einspeisen (nur Admin).
 * Felder: art = text | datei | audio | gespraech, titel, hinweis?, text?, datei?, fireflies_id?
 * Ergebnis: Entwürfe (status entwurf) – sichtbar erst nach Freigabe.
 */
export async function POST(req: NextRequest) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const form = await req.formData().catch(() => null);
  if (!form) return fehler('Formular erwartet');
  const art = String(form.get('art') ?? '') as ImportArt;
  let titel = String(form.get('titel') ?? '').trim();
  const hinweis = String(form.get('hinweis') ?? '').trim() || undefined;

  try {
    let text = '';
    if (art === 'text') {
      text = String(form.get('text') ?? '');
    } else if (art === 'datei' || art === 'audio') {
      const datei = form.get('datei');
      if (!(datei instanceof File)) return fehler('Bitte eine Datei auswählen');
      if (datei.size > MAX_DATEI) return fehler('Datei ist größer als 25 MB');
      const buffer = Buffer.from(await datei.arrayBuffer());
      text = art === 'datei' ? await textAusDatei(datei.name, buffer) : await textAusAudio(datei.name, buffer);
      if (!titel) titel = datei.name;
    } else if (art === 'gespraech') {
      const id = String(form.get('fireflies_id') ?? '');
      if (!id) return fehler('Bitte ein Gespräch auswählen');
      const g = await textAusGespraech(id);
      text = g.text;
      if (!titel) titel = g.titel;
    } else {
      return fehler('Unbekannte Art');
    }
    const ergebnis = await erzeugeEntwuerfe(k.svc, { art, titel: titel || 'Ohne Titel', text, hinweis, erstelltVon: k.user.id });
    return NextResponse.json(ergebnis);
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Import fehlgeschlagen', 422);
  }
}

/** GET – letzte Importe (nur Admin) */
export async function GET() {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { data } = await k.svc.from('akademie_importe').select('id, art, titel, status, fehler, entwuerfe, created_at').order('created_at', { ascending: false }).limit(30);
  return NextResponse.json({ importe: data ?? [] });
}
