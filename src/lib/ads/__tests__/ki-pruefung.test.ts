import { describe, it, expect } from 'vitest';
import { darfZumKunden, framesAusDataUrls, freigabeStatus, versionsKey, type KiPruefung } from '../ki-pruefung';

const ad = { typ: 'grafik' as const, titel: 'Vertriebler (m/w/d)', idee: 'Hook', asset_path: 'a/b.png', asset_url: null, inhalt: null };
const pruefung = (ampel: KiPruefung['ampel'], fuer = versionsKey(ad)): KiPruefung => ({
  ampel, punkte: 80, zusammenfassung: '', kriterien: [], verbesserungen: [], fuer, quelle: 'bild', bilder: 1, am: '2026-10-07T10:00:00Z',
});

describe('KI-Prüfung: Freigabe-Regel', () => {
  it('ohne Prüfung: nicht zum Kunden', () => {
    expect(freigabeStatus(ad)).toBe('fehlt');
    expect(darfZumKunden('fehlt')).toBe(false);
  });

  it('grün und gelb dürfen raus, rot nicht', () => {
    expect(freigabeStatus({ ...ad, ki_pruefung: pruefung('gruen') })).toBe('ok');
    expect(freigabeStatus({ ...ad, ki_pruefung: pruefung('gelb') })).toBe('warnung');
    expect(darfZumKunden(freigabeStatus({ ...ad, ki_pruefung: pruefung('rot') }))).toBe(false);
  });

  it('Prüfung gilt nur für die geprüfte Version – neue Datei oder neuer Text = erneut prüfen', () => {
    const geprueft = { ...ad, ki_pruefung: pruefung('gruen') };
    expect(freigabeStatus({ ...geprueft, asset_path: 'a/neu.png' })).toBe('fehlt');
    expect(freigabeStatus({ ...geprueft, idee: 'Anderer Hook' })).toBe('fehlt');
  });

  it('begründete Übersteuerung gilt für die Version, für die sie erteilt wurde', () => {
    const o = { grund: 'Kunde hat die Grafik selbst geliefert', user_id: 'u', am: '', fuer: versionsKey(ad) };
    expect(freigabeStatus({ ...ad, ki_pruefung: pruefung('rot'), ki_override: o })).toBe('uebersteuert');
    expect(freigabeStatus({ ...ad, idee: 'neu', ki_override: o })).toBe('fehlt');
  });

  it('Video-Standbilder: nur echte Bild-Data-URLs, höchstens 6', () => {
    const ok = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    expect(framesAusDataUrls([ok, 'javascript:alert(1)', 42, ok])).toHaveLength(2);
    expect(framesAusDataUrls(Array(10).fill(ok))).toHaveLength(6);
    expect(framesAusDataUrls('kaputt')).toEqual([]);
  });
});
