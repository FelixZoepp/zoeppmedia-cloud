import { describe, it, expect } from 'vitest';
import { baueUndo, istAbgesagtStage, jobFilterOr, mitProtokoll, pruefeUndo, sollJobAbbrechen, type AbsageBezug } from '../schnell-absage';

const C = '11111111-1111-4111-8111-111111111111';
const CONV = '22222222-2222-4222-8222-222222222222';
const APP = '33333333-3333-4333-8333-333333333333';
const TERMIN = '44444444-4444-4444-8444-444444444444';
const FREMD = '99999999-9999-4999-8999-999999999999';
const STAGE = '55555555-5555-4555-8555-555555555555';

const bezug: AbsageBezug = { candidateId: C, conversationIds: [CONV], applicationIds: [APP], appointmentIds: [TERMIN] };

describe('istAbgesagtStage', () => {
  it('erkennt stage_type rejected', () => expect(istAbgesagtStage({ name: 'Raus', stage_type: 'rejected' })).toBe(true));
  it('erkennt Altdaten am Namen', () => expect(istAbgesagtStage({ name: 'Abgesagt', stage_type: null })).toBe(true));
  it('andere Phasen nicht', () => expect(istAbgesagtStage({ name: 'Neu', stage_type: 'new' })).toBe(false));
  it('null', () => expect(istAbgesagtStage(null)).toBe(false));
});

describe('sollJobAbbrechen', () => {
  it.each([
    ['bewerber.nicht_erreicht', { candidate_id: C }],
    ['bot.nudge', { conversation_id: CONV, bot_step: 1 }],
    ['bot.process', { conversation_id: CONV }],
    ['bot.textnachricht', { conversationId: CONV, text: 'x' }],
    ['bot.rueckruf_erinnerung', { conversation_id: CONV, candidate_id: C }],
    ['bot.open', { application_id: APP }],
    ['sla.recruiter_24h', { application_id: APP }],
    ['appointment.reminder_24h', { appointment_id: TERMIN }],
  ])('%s wird abgebrochen', (type, payload) => {
    expect(sollJobAbbrechen({ type, payload }, bezug)).toBe(true);
  });

  it('fremde Jobs bleiben', () => {
    expect(sollJobAbbrechen({ type: 'bot.nudge', payload: { conversation_id: FREMD } }, bezug)).toBe(false);
    expect(sollJobAbbrechen({ type: 'berichte.abend', payload: { tag: '2026-10-16' } }, bezug)).toBe(false);
    expect(sollJobAbbrechen({ type: 'x', payload: null }, bezug)).toBe(false);
  });

  it('Medien-Download und Zustellstatus laufen weiter', () => {
    expect(sollJobAbbrechen({ type: 'media.download', payload: { conversation_id: CONV } }, bezug)).toBe(false);
    expect(sollJobAbbrechen({ type: 'whatsapp.status', payload: { candidate_id: C } }, bezug)).toBe(false);
  });
});

describe('jobFilterOr', () => {
  it('baut den or-Filter über alle Bezüge', () => {
    expect(jobFilterOr(bezug)).toBe(
      `payload->>candidate_id.eq.${C},payload->>conversation_id.in.(${CONV}),payload->>conversationId.in.(${CONV}),payload->>application_id.in.(${APP}),payload->>appointment_id.in.(${TERMIN})`,
    );
  });
  it('ohne Gespräche/Bewerbungen nur der Bewerber', () => {
    expect(jobFilterOr({ candidateId: C, conversationIds: [], applicationIds: [], appointmentIds: [] })).toBe(`payload->>candidate_id.eq.${C}`);
  });
  it('lässt keine Nicht-UUIDs in den Filter', () => {
    const f = jobFilterOr({ candidateId: C, conversationIds: ['a),status.eq.done'], applicationIds: [], appointmentIds: [] });
    expect(f).toBe(`payload->>candidate_id.eq.${C}`);
  });
});

describe('baueUndo / pruefeUndo', () => {
  const undo = baueUndo({
    vorherStageId: STAGE,
    grundGesetzt: true,
    bewerbungen: [{ id: APP, stage_id: STAGE, status: 'open' }],
    gespraeche: [{ id: CONV, state: 'bot_active' }, { id: FREMD, state: 'closed' }],
    termine: [{ id: TERMIN, status: 'geplant' }],
    einladungen: [],
  });

  it('merkt nur offene Gespräche', () => {
    expect(undo.gespraeche).toEqual([{ id: CONV, state: 'bot_active' }]);
  });

  it('übersteht den Weg über JSON', () => {
    expect(pruefeUndo(JSON.parse(JSON.stringify(undo)))).toEqual(undo);
  });

  it('wirft unbekannte Status und IDs raus', () => {
    const r = pruefeUndo({
      vorherStageId: STAGE,
      gespraeche: [{ id: CONV, state: 'hacked' }, { id: 'kein-uuid', state: 'waiting' }],
      bewerbungen: [{ id: APP, status: 'open', stage_id: 'x' }],
    });
    expect(r?.gespraeche).toEqual([]);
    expect(r?.bewerbungen).toEqual([{ id: APP, status: 'open', stage_id: null }]);
    expect(r?.grundGesetzt).toBe(false);
  });

  it('ungültige vorherStageId → null', () => {
    expect(pruefeUndo({ vorherStageId: 'x' })).toBeNull();
    expect(pruefeUndo(null)).toBeNull();
  });

  it('nur vorherStageId → Rest aus dem Protokoll', () => {
    const body = pruefeUndo({ vorherStageId: STAGE });
    expect(mitProtokoll(body, undo)).toEqual(undo);
    expect(mitProtokoll(null, undo)).toEqual(undo);
    expect(mitProtokoll(undo, null)).toEqual(undo);
  });
});
