import { describe, it, expect } from 'vitest';
import { manatalTelefon, manatalQuelle, schlageKundenVor, offeneMatches, aufKontaktWarten, pruefeZuordnung, nameStimmt } from '../abgleich';
import { normalizePhoneE164 } from '@/lib/phone';

describe('Manatal: Telefonnummern', () => {
  it('erkennt Ländervorwahl ohne Plus', () => {
    expect(manatalTelefon('4915112345678')).toBe('+4915112345678');
    expect(normalizePhoneE164(manatalTelefon('491701234567'))).toBe('+491701234567');
  });
  it('lässt 0049 und 0… für die normale Umwandlung', () => {
    expect(normalizePhoneE164(manatalTelefon('004915112345678'))).toBe('+4915112345678');
    expect(normalizePhoneE164(manatalTelefon('0151 1234 5678'))).toBe('+4915112345678');
  });
  it('entfernt die 0 nach der Ländervorwahl (49015563683589)', () => {
    expect(manatalTelefon('49015563683589')).toBe('+4915563683589');
  });
  it('leer bleibt leer', () => {
    expect(manatalTelefon(null)).toBeNull();
    expect(manatalTelefon('  ')).toBeNull();
  });
});

describe('Manatal: Quelle', () => {
  it('Indeed-Portal → indeed, sonst form', () => {
    expect(manatalQuelle({ source_details: { portal: { display_name: 'Indeed' } } })).toBe('indeed');
    expect(manatalQuelle({ source_details: null })).toBe('form');
  });
});

describe('Manatal: Kunden-Vorschlag über den Namen', () => {
  const kunden = [
    { id: 'e66b016b-7c1f-439f-990b-201ca8a61571', name: 'B&C Direct Sales' },
    { id: 'turhan', name: 'Turhan Vertriebs GmbH' },
    { id: 'roenne', name: 'Rönnefahrt UG' },
    { id: 'sw', name: 'Sales Winner UG' },
    { id: 'sf', name: 'Sales Fokus' },
  ];
  it('erkennt gleiche Namen trotz Rechtsform', () => {
    expect(schlageKundenVor('Turhan Vertriebs GmbH', kunden)).toBe('turhan');
    expect(schlageKundenVor('Rönnefahrt UG (haftungsbeschränkt)', kunden)).toBe('roenne');
  });
  it('schlägt B&C nie vor (läuft über die B&C-Cloud)', () => {
    expect(schlageKundenVor('B&C Direct Sales GmbH', kunden)).toBeNull();
  });
  it('kein Vorschlag bei mehreren oder keinem Treffer', () => {
    expect(schlageKundenVor('Sales', kunden)).toBeNull();
    expect(schlageKundenVor('Unbekannt GmbH', kunden)).toBeNull();
  });
});

describe('aufKontaktWarten', () => {
  it('wartet in den ersten 30 Minuten auf Telefon/E-Mail, danach nicht mehr', () => {
    const erstellt = '2026-10-31T11:38:37.849964Z';
    expect(aufKontaktWarten(erstellt, new Date('2026-10-31T11:39:04Z'))).toBe(true);
    expect(aufKontaktWarten(erstellt, new Date('2026-10-31T12:10:00Z'))).toBe(false);
  });
});

describe('offeneMatches', () => {
  const m = (id: number, created_at: string) => ({ id, organization: 1, job: 1, candidate: id, created_at });
  it('überspringt bereits erledigte Matches auf dem Stand, nicht aber neue mit gleicher Zeit', () => {
    const t = '2026-10-14T10:00:00Z';
    const r = offeneMatches([m(3, '2026-10-14T10:05:00Z'), m(1, t), m(2, t)], { seit: t, erledigt: new Set([1]) });
    expect(r.map((x) => x.id)).toEqual([2, 3]);
  });
});

describe('Zuordnungs-Prüfung (4-fach)', () => {
  const ok = {
    matchOrganisation: 8279338,
    agencyId: 'kadri',
    jobOrganisation: 8279338,
    orgName: 'Kadri Bilge',
    kunde: { id: 'kadri', name: 'Kadri Bilge', contact_name: 'Kadri Bilge' },
    stelleAgencyId: 'kadri',
  };
  it('lässt eine stimmige Zuordnung durch', () => {
    expect(pruefeZuordnung(ok)).toEqual([]);
  });
  it('sperrt bei fehlender Zuordnung, fremder Manatal-Stelle, falschem Namen oder fremder Cloud-Stelle', () => {
    expect(pruefeZuordnung({ ...ok, agencyId: undefined })[0]).toMatch(/Zuordnung/);
    expect(pruefeZuordnung({ ...ok, jobOrganisation: 8257136 })).toEqual(['Manatal-Stelle gehört zu einer anderen Firma']);
    expect(pruefeZuordnung({ ...ok, jobOrganisation: undefined })).toHaveLength(1);
    expect(pruefeZuordnung({ ...ok, orgName: 'Ömer Bilge' })).toHaveLength(1);
    expect(pruefeZuordnung({ ...ok, orgName: 'Fadi Abbes' })).toHaveLength(1);
    expect(pruefeZuordnung({ ...ok, stelleAgencyId: 'oemer' })).toEqual(['Cloud-Stelle gehört nicht zu diesem Kunden']);
    expect(pruefeZuordnung({ ...ok, agencyId: 'e66b016b-7c1f-439f-990b-201ca8a61571', kunde: { ...ok.kunde, id: 'e66b016b-7c1f-439f-990b-201ca8a61571' } })[0]).toMatch(/Zuordnung/);
  });
  it('erkennt die echten Kunden-Namen', () => {
    expect(nameStimmt('Rudi Muigg', { name: 'Rudolf Muigg OVB Finanz', contact_name: 'Rudolf Muigg' })).toBe(true);
    expect(nameStimmt('Ömer Bilge', { name: 'Kadri Bilge', contact_name: 'Kadri Bilge' })).toBe(false);
    expect(nameStimmt('Kadri Bilge', { name: 'Ömer Bilge', contact_name: 'Ömer Bilge' })).toBe(false);
    expect(nameStimmt('SalesWinner Direktvertrieb UG', { name: 'Sales Winner UG', contact_name: null })).toBe(true);
    expect(nameStimmt('Sedat Özdemir', { name: 'Özdemir', contact_name: 'Sedat Özdemir' })).toBe(true);
    expect(nameStimmt('Major Vertrieb', { name: 'Karen Major', contact_name: 'Karen Major' })).toBe(true);
    expect(nameStimmt('Hoffmann Solutions', { name: 'Hoffmann Solutions', contact_name: null })).toBe(true);
    expect(nameStimmt('Fadi Abbes', { name: 'Fadi Abbes', contact_name: null })).toBe(true);
    expect(nameStimmt('Fadi Abbes', { name: 'Ömer Bilge', contact_name: 'Ömer Bilge' })).toBe(false);
    expect(nameStimmt('Hoffmann Solutions', { name: 'Sales Winner UG', contact_name: null })).toBe(false);
  });
});
