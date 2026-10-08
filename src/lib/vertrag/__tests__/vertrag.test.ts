import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn(async () => undefined),
  createNotificationForInternals: vi.fn(async () => undefined),
}));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/resend', () => ({ sendVertragBestaetigt: vi.fn(), sendZahlungEingegangen: vi.fn() }));

import { bestaetigeVertrag, vertragHash, type BestaetigenDeps } from '../bestaetigen';
import { pruefeSetupZahlungen, verknuepfeSetupRechnung, findeSetupRechnung, type LexRechnung, type ZahlungDeps } from '../zahlung';
import { erzeugeBestaetigungPdf } from '../pdf';
import type { VertragDaten } from '../daten';
import { startPhase } from '@/lib/fulfillment/engine';
import { createNotification } from '@/lib/notifications/create';

const AG = 'ag-neu';
const TOKEN = 'a'.repeat(48);
const now = new Date('2026-10-08T10:00:00Z');

const daten: VertragDaten = {
  firma: 'SolarMax GmbH',
  anschrift: 'Hauptstr. 5, 50667 Köln',
  ansprechpartner: 'Max Muster',
  email: 'max@solarmax.de',
  paket: 'Scale',
  leistungen: ['Indeed', 'Funnel + Meta'],
  setup_netto: 2500,
  monat_netto: 5950,
  laufzeit_monate: 12,
  start_datum: '2026-10-08',
  garantie_ziel_starter: 5,
  ust_satz: 19,
};

function db(extra: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeDb({
    agencies: [
      { id: AG, name: 'SolarMax GmbH', contact_name: 'Max Muster', email: 'max@solarmax.de', fulfillment_phase: null, bausteine: ['indeed'], lex_contact_id: null, automatik: true },
      { id: 'ag-alt', name: 'Altkunde Solar GmbH', fulfillment_phase: 'continuity', bausteine: ['indeed'], lex_contact_id: 'lex-alt' },
    ],
    users: [
      { id: 'petra', role: 'employee', funktion: 'backoffice', aktiv: true, created_at: '2026-01-01' },
      { id: 'felix', role: 'admin', funktion: 'csm', aktiv: true, created_at: '2026-01-01' },
    ],
    vertraege: [{ id: 'v-1', agency_id: AG, token: TOKEN, daten, status: 'offen', setup_bezahlt_am: null, setup_rechnung_id: null, setup_rechnung_status: null }],
    invite_tokens: [{ id: 'inv-1', agency_id: AG, token: 'einladung123', redeemed: false, expires_at: '2026-10-15T00:00:00Z', created_at: '2026-10-08T09:00:00Z' }],
    system_einstellungen: [{ key: 'vertrag_agb_url', wert: 'https://zoeppmedia.de/agb' }],
    ...extra,
  });
}

function bDeps(over: Partial<BestaetigenDeps> = {}) {
  const mails: unknown[] = [];
  const deps: BestaetigenDeps = {
    sendVertragBestaetigt: async (p) => {
      mails.push(p);
    },
    findContact: async () => null,
    erzeugePdf: async () => new Uint8Array([37, 80, 68, 70]),
    ...over,
  };
  return { deps, mails };
}

const eingabe = { name: 'Max Muster', akzeptiert: true, ip: '203.0.113.7', userAgent: 'Mozilla/5.0' };

describe('Vertragsbestätigung', () => {
  let tables: Record<string, Record<string, unknown>[]>;
  let client: never;

  beforeEach(async () => {
    vi.mocked(createNotification).mockClear();
    ({ client, tables } = db());
    await startPhase(client, AG, 'zahlung', now);
  });

  it('speichert Name, Zeit, IP, User-Agent und Hash; hakt den Vertrag ab; PDF an Kunde + intern', async () => {
    const { deps, mails } = bDeps();
    const r = await bestaetigeVertrag(client, TOKEN, eingabe, deps, now);

    expect(r).toEqual({ status: 'bestaetigt', weiter_url: expect.stringContaining('/register/einladung123') });
    expect(tables.vertraege[0]).toMatchObject({
      status: 'bestaetigt',
      unterzeichner_name: 'Max Muster',
      bestaetigt_am: now.toISOString(),
      ip: '203.0.113.7',
      user_agent: 'Mozilla/5.0',
      agb_url: 'https://zoeppmedia.de/agb',
      daten_hash: vertragHash(daten, 'https://zoeppmedia.de/agb'),
    });
    expect(tables.client_steps.find((s) => s.step_key === 'z_vertrag')).toMatchObject({ status: 'erledigt' });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: 'max@solarmax.de', bcc: ['assistenz@zoeppmedia.de'], firma: 'SolarMax GmbH' });
  });

  it('Buchhaltung bekommt die Aufgabe „Setup-Rechnung stellen" – die Cloud stellt selbst keine Rechnung', async () => {
    const { deps } = bDeps();
    await bestaetigeVertrag(client, TOKEN, eingabe, deps, now);

    const rechnung = tables.client_steps.find((s) => s.step_key === 'z_rechnung_setup')!;
    expect(rechnung).toMatchObject({ status: 'offen', owner_user_id: 'petra', faellig_am: '2026-10-08' });
    expect(String(rechnung.kommentar)).toContain('2.500,00 € netto');
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith(client, expect.objectContaining({ user_id: 'petra', title: 'Setup-Rechnung in Lexware stellen: SolarMax GmbH' }));
    expect(tables.billing_runs ?? []).toHaveLength(0);
  });

  it('zweimal bestätigen → Folgeschritte nur einmal', async () => {
    const { deps, mails } = bDeps();
    await bestaetigeVertrag(client, TOKEN, eingabe, deps, now);
    const zweite = await bestaetigeVertrag(client, TOKEN, { ...eingabe, name: 'Jemand Anders' }, deps, now);

    expect(zweite.status).toBe('schon_bestaetigt');
    expect(mails).toHaveLength(1);
    expect(tables.vertraege[0].unterzeichner_name).toBe('Max Muster');
  });

  it('ohne Häkchen, ohne Namen oder mit falschem Token passiert nichts', async () => {
    const { deps, mails } = bDeps();
    expect((await bestaetigeVertrag(client, TOKEN, { ...eingabe, akzeptiert: false }, deps, now)).status).toBe('ungueltig');
    expect((await bestaetigeVertrag(client, TOKEN, { ...eingabe, name: ' M ' }, deps, now)).status).toBe('ungueltig');
    expect((await bestaetigeVertrag(client, 'b'.repeat(48), eingabe, deps, now)).status).toBe('nicht_gefunden');
    expect(tables.vertraege[0].status).toBe('offen');
    expect(mails).toHaveLength(0);
  });

  it('vorhandener Lexware-Kontakt wird nur verknüpft, nicht angelegt', async () => {
    const { deps } = bDeps({ findContact: async () => ({ id: 'lex-solarmax' }) });
    await bestaetigeVertrag(client, TOKEN, eingabe, deps, now);
    expect(tables.agencies.find((a) => a.id === AG)!.lex_contact_id).toBe('lex-solarmax');
  });

  it('Bestätigungs-PDF wird erzeugt', async () => {
    const pdf = await erzeugeBestaetigungPdf(daten, { unterzeichner_name: 'Max Muster', bestaetigt_am: now.toISOString(), ip: '203.0.113.7', daten_hash: 'abc', agb_url: null });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });
});

const rechnung = (over: Partial<LexRechnung>): LexRechnung => ({
  id: 'lex-re-1', voucherNumber: 'RE0042', voucherStatus: 'open', voucherDate: '2026-10-09T00:00:00.000+02:00',
  contactId: 'lex-solarmax', contactName: 'SolarMax GmbH', totalAmount: 2975, ...over,
});

describe('Zahlungserkennung', () => {
  let tables: Record<string, Record<string, unknown>[]>;
  let client: never;

  beforeEach(async () => {
    ({ client, tables } = db());
    await startPhase(client, AG, 'zahlung', now);
    await bestaetigeVertrag(client, TOKEN, eingabe, bDeps().deps, now);
  });

  function zDeps(liste: LexRechnung[]) {
    const calls = { laden: 0, mails: 0 };
    const deps: ZahlungDeps = {
      ladeRechnungen: async () => (calls.laden++, liste),
      sendZahlungEingegangen: async () => {
        calls.mails++;
      },
    };
    return { deps, calls };
  }

  it('findet die von Hand geschriebene Rechnung über den Namen, verknüpft den Kontakt und merkt sie (noch offen)', async () => {
    const { deps, calls } = zDeps([rechnung({})]);
    const r = await pruefeSetupZahlungen(client, now, deps);

    expect(r).toMatchObject({ offen: 1, gefunden: 1, bezahlt: 0 });
    expect(tables.vertraege[0]).toMatchObject({ setup_rechnung_id: 'lex-re-1', setup_rechnung_nummer: 'RE0042', setup_rechnung_status: 'open', setup_bezahlt_am: null });
    expect(tables.agencies.find((a) => a.id === AG)!.lex_contact_id).toBe('lex-solarmax');
    expect(tables.client_steps.find((s) => s.step_key === 'z_zahlung_setup')).toMatchObject({ status: 'offen' });
    expect(calls.mails).toBe(0);
  });

  it('bezahlt → Rechnungs- und Zahlungsschritt erledigt, Onboarding startet, Mail an Kunden', async () => {
    const { deps, calls } = zDeps([rechnung({ voucherStatus: 'paid' })]);
    const r = await pruefeSetupZahlungen(client, now, deps);

    expect(r.bezahlt).toBe(1);
    expect(tables.client_steps.find((s) => s.step_key === 'z_rechnung_setup')).toMatchObject({ status: 'erledigt' });
    expect(tables.client_steps.find((s) => s.step_key === 'z_zahlung_setup')).toMatchObject({ status: 'erledigt' });
    expect(tables.agencies.find((a) => a.id === AG)!.fulfillment_phase).toBe('onboarding');
    expect(tables.vertraege[0].setup_bezahlt_am).toBe(now.toISOString());
    expect(calls.mails).toBe(1);
  });

  it('Rechnungen vor der Vertragsbestätigung und von Bestandskunden werden ignoriert', async () => {
    const { deps } = zDeps([
      rechnung({ id: 'alt', voucherDate: '2026-10-01T00:00:00.000+02:00', voucherStatus: 'paid' }),
      rechnung({ id: 'bestand', contactId: 'lex-alt', contactName: 'Altkunde Solar GmbH', voucherStatus: 'paid' }),
    ]);
    const r = await pruefeSetupZahlungen(client, now, deps);
    expect(r).toMatchObject({ gefunden: 0, bezahlt: 0 });
    expect(tables.agencies.find((a) => a.id === 'ag-alt')!.fulfillment_phase).toBe('continuity');
  });

  it('ohne Automatik-Schalter wird die bezahlte Rechnung ignoriert (Bestandskunden unverändert)', async () => {
    tables.agencies.find((a) => a.id === AG)!.automatik = false;
    const { deps, calls } = zDeps([rechnung({ voucherStatus: 'paid' })]);
    const r = await pruefeSetupZahlungen(client, now, deps);
    expect(r).toMatchObject({ gefunden: 0, bezahlt: 0 });
    expect(calls.mails).toBe(0);
    expect(tables.agencies.find((a) => a.id === AG)!.fulfillment_phase).toBe('zahlung');
  });

  it('gedrosselt: höchstens alle 15 Minuten bei Lexware nachfragen', async () => {
    const { deps, calls } = zDeps([rechnung({})]);
    await pruefeSetupZahlungen(client, now, deps);
    expect((await pruefeSetupZahlungen(client, new Date(now.getTime() + 5 * 60_000), deps)).uebersprungen).toBe(true);
    expect(calls.laden).toBe(1);
    await pruefeSetupZahlungen(client, new Date(now.getTime() + 16 * 60_000), deps);
    expect(calls.laden).toBe(2);
  });

  it('Zahlung zweimal erkannt → Mail nur einmal', async () => {
    const { deps, calls } = zDeps([rechnung({ voucherStatus: 'paid' })]);
    await pruefeSetupZahlungen(client, now, deps);
    await verknuepfeSetupRechnung(client, AG, 'RE0042', deps, now);
    expect(calls.mails).toBe(1);
  });

  it('von Hand verknüpfen per Rechnungsnummer', async () => {
    const { deps } = zDeps([rechnung({ id: 'lex-re-9', voucherNumber: 'RE0099', contactName: 'Ganz anderer Name', contactId: 'lex-x', voucherStatus: 'paidoff' })]);
    const r = await verknuepfeSetupRechnung(client, AG, 're0099', deps, now);
    expect(r).toEqual({ ok: true, status: 'paidoff', bezahlt: true });
    expect(tables.agencies.find((a) => a.id === AG)!.fulfillment_phase).toBe('onboarding');
  });

  it('Bestandskunde ohne Vertragsbestätigung: Verknüpfen abgelehnt', async () => {
    const { deps } = zDeps([rechnung({})]);
    const r = await verknuepfeSetupRechnung(client, 'ag-alt', 'RE0042', deps, now);
    expect(r.ok).toBe(false);
  });

  it('Kontakt verknüpft → Abgleich exakt über den Kontakt, nicht über den Namen', () => {
    const treffer = findeSetupRechnung(
      [rechnung({ contactId: 'fremd', contactName: 'SolarMax GmbH' }), rechnung({ id: 'richtig', contactId: 'lex-solarmax', contactName: 'SM' })],
      { name: 'SolarMax GmbH', lex_contact_id: 'lex-solarmax', bestaetigt_am: now.toISOString() },
    );
    expect(treffer?.id).toBe('richtig');
  });
});
