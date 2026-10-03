import { describe, it, expect } from 'vitest';
import { createFakeDb } from './fake-db';
import {
  startPhase,
  setStepStatus,
  completeCustomerStep,
  completeBySignal,
  ensureFulfillment,
} from '../engine';
import { stepsForPhase, mapLegacyPhase, STEPS } from '../catalog';

const AG = 'agency-1';
const users = [
  { id: 'felix', role: 'admin', funktion: 'csm', aktiv: true, created_at: '2026-01-01' },
  { id: 'nils', role: 'employee', funktion: 'media_buyer', aktiv: true, created_at: '2026-02-01' },
  { id: 'petra', role: 'employee', funktion: 'backoffice', aktiv: true, created_at: '2026-03-01' },
  { id: 'kunde-user', role: 'agency_owner', agency_id: AG, last_login: null, created_at: '2026-04-01' },
];

function db(extra: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeDb({
    agencies: [{ id: AG, fulfillment_phase: null, onboarding_completed: false, phase_override: null }],
    users,
    ...extra,
  });
}

const now = new Date('2026-10-03T08:00:00Z');

describe('Katalog', () => {
  it('jeder Schritt hat einen eindeutigen Key', () => {
    expect(new Set(STEPS.map((s) => s.key)).size).toBe(STEPS.length);
  });

  it('Zahlung ist immer die erste Phase, Continuity hat die Checks bis Tag 90', () => {
    expect(stepsForPhase('zahlung').map((s) => s.key)).toContain('z_zahlung_setup');
    expect(stepsForPhase('continuity').map((s) => s.frist_tage)).toEqual([7, 14, 30, 45, 60, 75, 90]);
  });

  it('alte Pipeline-Phasen werden sinnvoll übernommen', () => {
    expect(mapLegacyPhase('bestandskunde', true)).toBe('continuity');
    expect(mapLegacyPhase('kampagne_starten', false)).toBe('setup');
    expect(mapLegacyPhase('warten_zugaenge', false)).toBe('onboarding');
    expect(mapLegacyPhase(null, false)).toBe('onboarding');
  });
});

describe('startPhase', () => {
  it('legt die Schritte der Phase an, mit Frist und zuständiger Person', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'zahlung', now);

    expect(tables.agencies[0]).toMatchObject({ fulfillment_phase: 'zahlung' });
    const steps = tables.client_steps;
    expect(steps.map((s) => s.step_key)).toEqual(['z_vertrag', 'z_rechnung_setup', 'z_zahlung_setup']);
    expect(steps.find((s) => s.step_key === 'z_rechnung_setup')).toMatchObject({ owner_user_id: 'petra', faellig_am: '2026-10-03' });
    expect(steps.find((s) => s.step_key === 'z_vertrag')).toMatchObject({ owner_user_id: 'felix' });
    expect(steps.find((s) => s.step_key === 'z_zahlung_setup')).toMatchObject({ faellig_am: '2026-10-10' });
  });

  it('Kunden-Schritte des Onboardings gehen zur Prüfung an Nils', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'onboarding', now);
    const seite = tables.client_steps.find((s) => s.step_key === 'o_meta_seite')!;
    expect(seite).toMatchObject({ wer: 'kunde', owner_user_id: 'nils' });
  });

  it('schon erfüllte Signale werden sofort abgehakt (Kunde war schon eingeloggt)', async () => {
    const { client, tables } = db({
      users: users.map((u) => (u.id === 'kunde-user' ? { ...u, last_login: '2026-10-01' } : u)),
    });
    await startPhase(client, AG, 'onboarding', now);
    expect(tables.client_steps.find((s) => s.step_key === 'o_cloud_login')).toMatchObject({ status: 'erledigt' });
    expect(tables.client_steps.find((s) => s.step_key === 'o_bilder')).toMatchObject({ status: 'offen' });
  });

  it('Continuity: Fristen zählen ab Kampagnenstart', async () => {
    const { client, tables } = db();
    tables.agencies[0].launch_datum = '2026-10-01';
    await startPhase(client, AG, 'continuity', now);
    expect(tables.client_steps.find((s) => s.step_key === 'c_check_90')).toMatchObject({ faellig_am: '2026-12-30' });
  });
});

describe('Phasenwechsel', () => {
  it('alle Schritte erledigt → nächste Phase startet automatisch', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'zahlung', now);
    const ids = tables.client_steps.map((s) => s.id as string);

    expect((await setStepStatus(client, ids[0], 'erledigt', { userId: 'felix', now })).advancedTo).toBeNull();
    await setStepStatus(client, ids[1], 'erledigt', { userId: 'petra', now });
    const r = await setStepStatus(client, ids[2], 'erledigt', { userId: 'petra', now });

    expect(r.advancedTo).toBe('onboarding');
    expect(tables.agencies[0].fulfillment_phase).toBe('onboarding');
    expect(tables.client_steps.some((s) => s.step_key === 'o_kickoff')).toBe(true);
  });

  it('"nicht nötig" zählt als erledigt', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'zahlung', now);
    for (const s of tables.client_steps.filter((x) => x.phase === 'zahlung')) {
      await setStepStatus(client, s.id as string, 'nicht_noetig', { now });
    }
    expect(tables.agencies[0].fulfillment_phase).toBe('onboarding');
  });

  it('jede Statusänderung landet im Verlauf', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'zahlung', now);
    await setStepStatus(client, tables.client_steps[0].id as string, 'in_arbeit', { userId: 'felix', now });
    expect(tables.client_step_log).toEqual([
      expect.objectContaining({ von_status: 'offen', nach_status: 'in_arbeit', user_id: 'felix' }),
    ]);
  });

  it('Kampagne live → Kampagnenstart wird gesetzt', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'setup', now);
    const launch = tables.client_steps.find((s) => s.step_key === 's_launch')!;
    await setStepStatus(client, launch.id as string, 'erledigt', { now });
    expect(tables.agencies[0].launch_datum).toBe('2026-10-03');
  });
});

describe('Kunden-Schritte', () => {
  it('Meta-Zugang erledigt → erst zur Prüfung, Phase bleibt', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'onboarding', now);
    const seite = tables.client_steps.find((s) => s.step_key === 'o_meta_seite')!;
    expect(await completeCustomerStep(client, seite.id as string, 'kunde-user')).toBe('zur_pruefung');
  });

  it('Freigabe ohne Prüfung → direkt erledigt', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'setup', now);
    const freigabe = tables.client_steps.find((s) => s.step_key === 's_freigabe')!;
    expect(await completeCustomerStep(client, freigabe.id as string, 'kunde-user')).toBe('erledigt');
  });

  it('interne Schritte kann der Kunde nicht abhaken', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'setup', now);
    const intern = tables.client_steps.find((s) => s.step_key === 's_funnel')!;
    await expect(completeCustomerStep(client, intern.id as string, 'kunde-user')).rejects.toThrow('Kein Kunden-Schritt');
  });
});

describe('Signale und Bestandskunden', () => {
  it('Transkript hochgeladen → Schritt automatisch erledigt', async () => {
    const { client, tables } = db();
    await startPhase(client, AG, 'onboarding', now);
    expect(await completeBySignal(client, AG, 'transkript_hochgeladen')).toBe(true);
    expect(tables.client_steps.find((s) => s.step_key === 'o_transkript')).toMatchObject({ status: 'erledigt' });
    expect(await completeBySignal(client, AG, 'transkript_hochgeladen')).toBe(false); // nichts mehr offen
  });

  it('Bestandskunde aus der alten Pipeline wird in die passende Phase übernommen', async () => {
    const { client, tables } = db();
    tables.agencies[0].phase_override = 'bestandskunde';
    expect(await ensureFulfillment(client, AG, now)).toBe('continuity');
    expect(tables.client_steps.every((s) => s.phase === 'continuity')).toBe(true);
    expect(await ensureFulfillment(client, AG, now)).toBe('continuity'); // idempotent
  });
});
