import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './fake-db';
import type { Briefing } from '@/lib/indeed/anzeige';

const briefing: Briefing = {
  firma: 'Muster Vertrieb GmbH',
  jobtitel: 'Vertriebspartner Glasfaser (m/w/d)',
  regionen: ['Köln', 'Bonn'],
  radius_km: 30,
  produkt: 'Glasfaser',
  aufgabe: null,
  verguetung: null,
  provision: null,
  verdienst_von: 3000,
  verdienst_bis: 6000,
  anstellungsart: 'Vollzeit',
  karrierestufen: [],
  firmenwagen_ab: null,
  einarbeitung: null,
  extras: [],
  erfahrung_noetig: false,
  fuehrerschein_noetig: true,
  start: null,
  ansprache: 'sie',
  alleinstellung: null,
  bleibegruende: null,
  belegbare_zahlen: null,
  verbotene_aussagen: null,
};

let aktuellesBriefing: Briefing | null = briefing;
const generierung = { starte: vi.fn(), fuehreAus: vi.fn() };

vi.mock('@/lib/indeed/anzeige', () => ({ ladeBriefing: vi.fn(async () => aktuellesBriefing) }));
vi.mock('@/lib/notifications/create', () => ({ createNotificationForInternals: vi.fn(async () => undefined) }));
vi.mock('../generator', () => ({
  starteGenerierung: (...a: unknown[]) => generierung.starte(...a),
  fuehreGenerierungAus: (...a: unknown[]) => generierung.fuehreAus(...a),
}));

const { richteSetupEin, jobAusBriefing, botAusBriefing } = await import('../auto-setup');

function db(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  return createFakeDb({
    agencies: [{ id: 'k1', name: 'Muster Vertrieb GmbH' }],
    users: [{ id: 'u-nils', role: 'employee', funktion: 'media_buyer', aktiv: true, created_at: '2026-01-01' }],
    jobs: [],
    bot_configs: [],
    bot_questions: [],
    availability_rules: [],
    fulfillment_generierungen: [],
    ...extra,
  });
}

describe('Automatisches Setup nach dem Onboarding', () => {
  beforeEach(() => {
    aktuellesBriefing = briefing;
    process.env.ANTHROPIC_API_KEY = 'test';
    generierung.starte.mockReset().mockImplementation(async (svc: { from: (t: string) => { insert: (r: unknown) => unknown } }) => {
      await svc.from('fulfillment_generierungen').insert({ agency_id: 'k1', status: 'laeuft' });
      return { id: 'gen-1', teile: ['ads', 'indeed'] };
    });
    generierung.fuehreAus.mockReset().mockResolvedValue(undefined);
  });

  it('legt Stelle, Bot, Fragen und Terminzeiten an und startet den Generator', async () => {
    const { client, tables } = db();
    const erg = await richteSetupEin(client, 'k1');

    expect(erg).toMatchObject({ jobAngelegt: true, botAngelegt: true, verfuegbarkeitAngelegt: true, generatorGestartet: true });
    expect(tables.jobs).toHaveLength(1);
    expect(tables.jobs[0]).toMatchObject({
      title: 'Vertriebspartner Glasfaser (m/w/d)',
      location: 'Köln, Bonn',
      status: 'active',
      is_default: true,
      indeed_mode: 'off',
      appointment_duration_minutes: 30,
      appointment_buffer_minutes: 15,
    });
    expect(tables.bot_configs).toHaveLength(1);
    expect(tables.bot_configs[0]).toMatchObject({ formality: 'sie', active: true, faq: [] });
    expect(tables.jobs[0].bot_config_id).toBe(tables.bot_configs[0].id);
    expect(tables.bot_questions.length).toBeGreaterThan(0);
    expect(tables.availability_rules.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5]);
    expect(generierung.starte).toHaveBeenCalledWith(client, 'k1', 'u-nils', null);
    expect(generierung.fuehreAus).toHaveBeenCalledOnce();
  });

  it('ist idempotent: zweiter Abschluss legt nichts doppelt an', async () => {
    const { client, tables } = db();
    await richteSetupEin(client, 'k1');
    const zweiter = await richteSetupEin(client, 'k1');

    expect(zweiter).toMatchObject({ jobAngelegt: false, botAngelegt: false, verfuegbarkeitAngelegt: false, generatorGestartet: false });
    expect(tables.jobs).toHaveLength(1);
    expect(tables.bot_configs).toHaveLength(1);
    expect(tables.availability_rules).toHaveLength(5);
    expect(generierung.starte).toHaveBeenCalledOnce();
  });

  it('nutzt eine vorhandene Stelle mit Bot und ergänzt nur, was fehlt', async () => {
    const { client, tables } = db({
      jobs: [{ id: 'j1', agency_id: 'k1', bot_config_id: 'b1', is_default: true, status: 'active', created_at: '2026-01-01' }],
    });
    const erg = await richteSetupEin(client, 'k1', { generator: false });

    expect(erg).toMatchObject({ jobId: 'j1', jobAngelegt: false, botAngelegt: false, verfuegbarkeitAngelegt: true });
    expect(tables.jobs).toHaveLength(1);
    expect(tables.bot_configs).toHaveLength(0);
    expect(tables.availability_rules.every((r) => r.job_id === 'j1')).toBe(true);
    expect(generierung.starte).not.toHaveBeenCalled();
  });

  it('startet den Generator nicht ohne Stellenbezeichnung und meldet das', async () => {
    aktuellesBriefing = { ...briefing, jobtitel: null };
    const { client, tables } = db();
    const erg = await richteSetupEin(client, 'k1');

    expect(tables.jobs[0].title).toBe('Vertriebsmitarbeiter (m/w/d)');
    expect(erg.generatorGestartet).toBe(false);
    expect(erg.hinweise.join(' ')).toContain('Stellenbezeichnung fehlt');
    expect(generierung.starte).not.toHaveBeenCalled();
  });
});

describe('Ableitung aus dem Briefing', () => {
  it('Verdienst als Spanne, ohne erfundene Angaben', () => {
    expect(jobAusBriefing(briefing).salary_range).toBe('3.000 € – 6.000 €');
    expect(jobAusBriefing({ ...briefing, verdienst_von: null, verdienst_bis: null }).salary_range).toBeNull();
    expect(jobAusBriefing(null)).toEqual({ title: 'Vertriebsmitarbeiter (m/w/d)', location: null, employment_type: null, salary_range: null });
  });

  it('Führerschein-Frage entfällt, wenn keiner nötig ist; FAQ bleibt leer', () => {
    const mit = botAusBriefing(briefing);
    const ohne = botAusBriefing({ ...briefing, fuehrerschein_noetig: false });
    expect(mit.questions.some((q) => q.key === 'fuehrerschein')).toBe(true);
    expect(ohne.questions.some((q) => q.key === 'fuehrerschein')).toBe(false);
    expect(mit.config.faq).toEqual([]);
  });
});
