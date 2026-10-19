import { describe, expect, it } from 'vitest';
import { istGewonnen, OPP_GEWONNEN } from '../deal-feier';

describe('istGewonnen', () => {
  it('erkennt Wechsel auf gewonnen und neu angelegte gewonnene Opportunities', () => {
    expect(istGewonnen({ object_type: 'opportunity', action: 'updated', changed_fields: ['status_id'], data: { status_id: OPP_GEWONNEN }, previous_data: { status_id: 'stat_x' } })).toBe(true);
    expect(istGewonnen({ object_type: 'opportunity', action: 'created', data: { status_id: OPP_GEWONNEN } })).toBe(true);
  });

  it('keine Feier bei anderen Änderungen an einer schon gewonnenen Opportunity', () => {
    expect(istGewonnen({ object_type: 'opportunity', action: 'updated', changed_fields: ['value'], data: { status_id: OPP_GEWONNEN } })).toBe(false);
    expect(istGewonnen({ object_type: 'opportunity', action: 'updated', changed_fields: ['status_id'], data: { status_id: 'stat_x' }, previous_data: { status_id: OPP_GEWONNEN } })).toBe(false);
    expect(istGewonnen({ object_type: 'lead', action: 'updated', data: { status_id: OPP_GEWONNEN } })).toBe(false);
  });
});

describe('istGewonnen – Upsell-Pipeline', () => {
  it('„Upsell - Gewonnen“ zählt als Abschluss', () => {
    const UP = 'stat_7NL2g8Yj20LVCQZtfAtLD3oe5DDZkMNHSJmsK9XEcAX';
    expect(istGewonnen({ object_type: 'opportunity', action: 'updated', changed_fields: ['status_id'], data: { status_id: UP }, previous_data: { status_id: 'stat_x' } })).toBe(true);
    expect(istGewonnen({ object_type: 'opportunity', action: 'updated', changed_fields: ['status_id'], data: { status_id: UP }, previous_data: { status_id: UP } })).toBe(false);
  });
});
