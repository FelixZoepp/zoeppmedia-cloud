import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/freigaben', () => ({ istFreigegeben: vi.fn() }));
import { baueEvent, baueUserData, fbcAus, klickAusPayload, normEmail, normTelefon, sha256, teileName } from '../capi';
import { capiAusCloseEreignis } from '../capi-close';

describe('Normalisierung (Meta-Vorgaben)', () => {
  it('E-Mail, Telefon, Name', () => {
    expect(normEmail('  Max.Muster@GMX.de ')).toBe('max.muster@gmx.de');
    expect(normEmail('kein-mail')).toBeNull();
    expect(normTelefon('0176 62168099')).toBe('4917662168099');
    expect(normTelefon('+43 664 88265359')).toBe('4366488265359');
    expect(normTelefon('0049 171 1')).toBeNull();
    expect(teileName('Alexander Carl-Eric Großkurth')).toEqual({ fn: 'alexander', ln: 'großkurth' });
  });
  it('fbc aus fbclid + erstem Besuch', () => {
    expect(fbcAus('IwZX', '2026-10-18T20:42:45.471Z')).toBe('fb.1.1792356165471.IwZX');
    expect(fbcAus(null, null)).toBeNull();
  });
  it('nur Hashes, gleiche external_id je Lead', () => {
    const u = baueUserData({ email: 'A@b.de', phone: '0176 1234567', name: 'Max Muster', fbclid: 'x', ersterBesuch: null }, 'lead_1', 'fb.1.1.x');
    expect(u.em).toEqual([sha256('a@b.de')]);
    expect(u.ph).toEqual([sha256('491761234567')]);
    expect(u.external_id).toEqual([sha256('lead_1')]);
    expect(JSON.stringify(u)).not.toContain('a@b.de');
  });
  it('Purchase mit Wert in EUR, Lead ohne', () => {
    const z = new Date('2026-10-19T10:00:00Z');
    expect(baueEvent({ name: 'Purchase', eventId: 'p', zeit: z, userData: {}, wert: 6000 }).custom_data).toMatchObject({ currency: 'EUR', value: 6000 });
    expect(baueEvent({ name: 'Lead', eventId: 'l', zeit: z, userData: {} })).toMatchObject({ event_name: 'Lead', event_time: 1792404000, action_source: 'system_generated' });
  });
  it('Klick aus Perspective-Payload', () => {
    expect(klickAusPayload({ profile: { fbclid: { title: 'Fbclid', value: 'abc' } }, meta: { ps_first_seen_at: '2026-10-19T07:50:58.705Z', ps_converted_at: '2026-10-19T07:52:42.978Z' } })).toEqual({
      fbclid: 'abc',
      ersterBesuch: '2026-10-19T07:50:58.705Z',
      konvertiert: '2026-10-19T07:52:42.978Z',
    });
  });
});

describe('capiAusCloseEreignis', () => {
  const CT = 'stat_RjrZL3ifb4mKNiPEFFX1IQgse1fbI94R9XZgere2wZT';
  const WON = 'stat_BFVJiIlomolS2JMTSHc49cHnvh2Rl1IuWnudLEYRh0n';
  const UPSELL_WON = 'stat_7NL2g8Yj20LVCQZtfAtLD3oe5DDZkMNHSJmsK9XEcAX';
  const upd = (von: string, nach: string, value?: number) => ({ object_type: 'opportunity', object_id: 'oppo_1', action: 'updated', changed_fields: ['status_id'], data: { status_id: nach, value }, previous_data: { status_id: von } });
  it('Setting → Closing terminiert = QualifiedLead', () => {
    expect(capiAusCloseEreignis(upd('stat_setting', CT))).toEqual({ name: 'QualifiedLead', eventId: 'qualified_oppo_1', oppId: 'oppo_1' });
  });
  it('gewonnen (D2D) = Purchase mit Wert, Upsell nicht', () => {
    expect(capiAusCloseEreignis(upd(CT, WON, 595000))).toMatchObject({ name: 'Purchase', wert: 5950 });
    expect(capiAusCloseEreignis(upd('x', UPSELL_WON, 720000))).toBeNull();
  });
  it('ohne Statuswechsel nichts', () => {
    expect(capiAusCloseEreignis({ ...upd(CT, CT), changed_fields: ['value'] })).toBeNull();
  });
});
