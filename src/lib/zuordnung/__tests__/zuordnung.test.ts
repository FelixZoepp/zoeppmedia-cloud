import { describe, it, expect } from 'vitest';
import { nameNorm, belegPasst } from '../belege';
import { befunde } from '../waechter';
import { funnelEntscheidung } from '@/lib/perspective/zuordnung';
import { kontaktZaehlt } from '@/lib/perspective/abruf';
import { nochJung } from '@/lib/manatal/abgleich';

describe('Indeed-Belege', () => {
  it('Name unabhängig von Reihenfolge, Groß-/Kleinschreibung und Umlauten', () => {
    expect(nameNorm('Schmitt Jonathan')).toBe(nameNorm('jonathan SCHMITT'));
    expect(nameNorm('Sümriye Karapinar')).toBe(nameNorm('Suemriye Karapinar'));
    expect(nameNorm('')).toBeNull();
  });
  it('Beleg passt über Telefon, E-Mail oder vollen Namen – nie über Vornamen allein', () => {
    const b = { name_norm: nameNorm('Ekrem Akin'), email: 'ekrem.akin@gmx.de', phone_e164: '+4917631307807' };
    expect(belegPasst(b, { name: null, email: null, phone: '0176 31307807' })).toBe(true);
    expect(belegPasst(b, { name: null, email: 'Ekrem.Akin@gmx.de', phone: null })).toBe(true);
    expect(belegPasst(b, { name: 'Akin Ekrem', email: null, phone: null })).toBe(true);
    expect(belegPasst({ ...b, name_norm: 'ekrem' }, { name: 'Ekrem', email: null, phone: null })).toBe(false);
    expect(belegPasst(b, { name: 'Ekrem Yilmaz', email: 'x@y.de', phone: '0151 1111111' })).toBe(false);
  });
});

describe('Funnel-Zuordnung (Meta)', () => {
  const zeilen = [
    { agency_id: 'kadri', perspective_funnel_id: 'f1', funnel_name: 'Kadri Bilge' },
    { agency_id: 'oemer', perspective_funnel_id: 'f2', funnel_name: 'Bilge Funnel' },
  ];
  it('ok nur, wenn der Webhook-Kunde zur festen Funnel-Zuordnung passt', () => {
    expect(funnelEntscheidung(zeilen, 'kadri', 'Kadri Bilge', null).ok).toBe(true);
    expect(funnelEntscheidung(zeilen, 'kadri', null, 'f1').ok).toBe(true);
  });
  it('Prüfstand bei falschem Kunden, unbekanntem oder doppelt vergebenem Funnel', () => {
    const falsch = funnelEntscheidung(zeilen, 'kadri', 'Bilge Funnel', null);
    expect(falsch).toMatchObject({ ok: false, vorschlag: 'oemer' });
    expect(funnelEntscheidung(zeilen, 'kadri', 'Unbekannt', null)).toMatchObject({ ok: false, vorschlag: 'kadri' });
    expect(funnelEntscheidung([...zeilen, { agency_id: 'x', perspective_funnel_id: 'f3', funnel_name: 'Kadri Bilge' }], 'kadri', 'Kadri Bilge', null)).toMatchObject({ ok: false, vorschlag: null });
  });
});

describe('Abruf & Wartezeiten', () => {
  const jetzt = new Date('2026-10-31T12:00:00Z');
  it('Perspective-Kontakt zählt nur abgeschlossen, mit Kontakt und im Fenster', () => {
    expect(kontaktZaehlt({ id: '1', email: 'a@b.de', meta: { ps_converted_at: '2026-10-29T09:55:04Z' } }, jetzt)).toBe(true);
    expect(kontaktZaehlt({ id: '1', email: 'a@b.de', meta: {} }, jetzt)).toBe(false);
    expect(kontaktZaehlt({ id: '1', meta: { ps_converted_at: '2026-10-29T09:55:04Z' } }, jetzt)).toBe(false);
    expect(kontaktZaehlt({ id: '1', email: 'a@b.de', meta: { ps_converted_at: '2026-10-01T00:00:00Z' } }, jetzt)).toBe(false);
  });
  it('nochJung', () => {
    expect(nochJung('2026-10-31T10:00:00Z', jetzt, 180)).toBe(true);
    expect(nochJung('2026-10-31T08:00:00Z', jetzt, 180)).toBe(false);
  });
});

describe('Zuordnungs-Wächter', () => {
  const jetzt = new Date('2026-10-31T12:00:00Z');
  const ok = { jetzt, manatalLauf: '2026-10-31T11:59:00Z', manatalAktiv: true, perspective: { zeit: '2026-10-31T11:57:00Z', verbunden: true, fehler: [] }, offenAelterAls2h: 0, ohneBelege: [] };
  it('still, wenn alles läuft', () => {
    expect(befunde(ok)).toEqual([]);
  });
  it('meldet hängende Abrufe, fehlende Verbindung, Prüfstand und fehlende Weiterleitung', () => {
    expect(befunde({ ...ok, manatalLauf: '2026-10-31T11:00:00Z' })[0].titel).toMatch(/Manatal-Abruf hängt/);
    expect(befunde({ ...ok, perspective: { zeit: '2026-10-31T11:57:00Z', verbunden: false } })[0].titel).toMatch(/nicht verbunden/);
    expect(befunde({ ...ok, perspective: null })[0].titel).toMatch(/Perspective-Abruf hängt/);
    expect(befunde({ ...ok, offenAelterAls2h: 3 })[0].text).toMatch(/^3 Bewerber/);
    expect(befunde({ ...ok, ohneBelege: ['Kadri Bilge'] })[0].text).toMatch(/Kadri Bilge/);
  });
});
