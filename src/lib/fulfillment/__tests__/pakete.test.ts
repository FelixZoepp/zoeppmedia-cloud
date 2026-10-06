import { describe, it, expect } from 'vitest';
import { createFakeDb } from './fake-db';
import { startPhase, aendereBausteine } from '../engine';
import { stepsForKunde } from '../catalog';
import { bausteineVon, bausteineBereinigen, mitInnendienst, paketVorlage } from '../pakete';

const AG = 'agency-1';
const users = [
  { id: 'felix', role: 'admin', funktion: 'csm', aktiv: true, created_at: '2026-01-01' },
  { id: 'nils', role: 'employee', funktion: 'media_buyer', aktiv: true, created_at: '2026-02-01' },
  { id: 'ina', role: 'employee', funktion: 'innendienst', aktiv: true, created_at: '2026-03-01' },
];
const now = new Date('2026-10-06T08:00:00Z');

function db(bausteine: string[] | null) {
  return createFakeDb({
    agencies: [{ id: AG, fulfillment_phase: null, onboarding_completed: false, phase_override: null, bausteine }],
    users,
  });
}

describe('Bausteine', () => {
  it('Bestandskunden ohne Angabe: Indeed + Meta wie bisher, Innendienst-Übersicht wie bisher', () => {
    expect(bausteineVon(null)).toEqual(['indeed', 'meta']);
    expect(mitInnendienst(null)).toBe(true);
    expect(mitInnendienst(['indeed'])).toBe(false);
    expect(mitInnendienst(['indeed', 'innendienst'])).toBe(true);
  });

  it('Eingaben werden bereinigt, leer ist ungültig', () => {
    expect(bausteineBereinigen(['meta', 'quatsch', 'indeed'])).toEqual(['indeed', 'meta']);
    expect(bausteineBereinigen([])).toBeNull();
    expect(bausteineBereinigen('indeed')).toBeNull();
  });

  it('Indeed Start: 500 €, 12 Monate, nur Indeed', () => {
    expect(paketVorlage('indeed_start')).toMatchObject({ retainer: 500, laufzeit: 12, bausteine: ['indeed'] });
  });

  it('nur Indeed: kein Kick-off, keine Meta-Zugänge, kein Funnel/Werbemanager', () => {
    const onboarding = stepsForKunde('onboarding', ['indeed']).map((s) => s.key);
    expect(onboarding).toEqual(['o_cloud_login', 'o_inhaltsfunnel', 'o_indeed', 'o_whatsapp', 'o_zugaenge_geprueft']);
    const setup = stepsForKunde('setup', ['indeed']).map((s) => s.key);
    expect(setup).toEqual(['s_indeed_anzeige', 's_testlead', 's_freigabe', 's_starttermin', 's_launch']);
  });

  it('Funnel + Meta ohne Indeed: kein Indeed-Schritt', () => {
    const keys = [...stepsForKunde('onboarding', ['meta']), ...stepsForKunde('setup', ['meta'])].map((s) => s.key);
    expect(keys).toContain('o_meta_werbekonto');
    expect(keys).toContain('s_funnel');
    expect(keys).not.toContain('o_indeed');
    expect(keys).not.toContain('s_indeed_anzeige');
    expect(keys).not.toContain('s_innendienst');
  });

  it('startPhase legt nur die gebuchten Schritte an, Innendienst geht an den Innendienst', async () => {
    const { client, tables } = db(['indeed', 'innendienst']);
    await startPhase(client, AG, 'setup', now);
    const keys = tables.client_steps.map((s) => s.step_key);
    expect(keys).not.toContain('s_funnel');
    expect(tables.client_steps.find((s) => s.step_key === 's_innendienst')).toMatchObject({ owner_user_id: 'ina' });
  });

  it('Upsell auf Meta: neue Schritte kommen dazu; Wegfall: offene Schritte „nicht nötig“', async () => {
    const { client, tables } = db(['indeed']);
    await startPhase(client, AG, 'setup', now);
    expect(tables.client_steps.some((s) => s.step_key === 's_funnel')).toBe(false);

    const up = await aendereBausteine(client, AG, ['indeed', 'meta']);
    expect(up.neu).toBeGreaterThan(0);
    expect(tables.client_steps.find((s) => s.step_key === 's_funnel')).toMatchObject({ status: 'offen' });
    expect(tables.agencies[0].bausteine).toEqual(['indeed', 'meta']);

    const down = await aendereBausteine(client, AG, ['meta']);
    expect(down.entfallen).toBe(1);
    expect(tables.client_steps.find((s) => s.step_key === 's_indeed_anzeige')).toMatchObject({ status: 'nicht_noetig' });
  });
});

describe('Signal: alles freigegeben', () => {
  it('hakt „Ads & Texte freigegeben“ erst ab, wenn nichts mehr offen ist', async () => {
    const { isSignalSatisfied } = await import('../engine');
    const offen = createFakeDb({ ad_items: [{ id: 'a', agency_id: AG, stage: 'bereit' }, { id: 'b', agency_id: AG, stage: 'freigabe_kunde' }] });
    expect(await isSignalSatisfied(offen.client, AG, 'ads_freigegeben')).toBe(false);
    const fertig = createFakeDb({ ad_items: [{ id: 'a', agency_id: AG, stage: 'bereit' }, { id: 'c', agency_id: AG, stage: 'verworfen' }] });
    expect(await isSignalSatisfied(fertig.client, AG, 'ads_freigegeben')).toBe(true);
    const leer = createFakeDb({ ad_items: [] });
    expect(await isSignalSatisfied(leer.client, AG, 'ads_freigegeben')).toBe(false);
  });
});
