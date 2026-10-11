import { describe, expect, it } from 'vitest';
import { entscheide } from '../anruf-sperre';

const jetzt = new Date('2026-10-12T10:00:00Z');
const basis = { id: 'acti_1', lead_id: 'lead_1', date_created: '2026-10-12T09:55:00Z' };

describe('Anruf-Sperre', () => {
  it('nicht erreicht → 1 Tag gesperrt', () => {
    expect(entscheide({ ...basis, direction: 'outbound', status: 'completed', disposition: 'no-answer', duration: 0 }, null, jetzt)).toEqual({ aktion: 'sperren', bis: '2026-10-13T10:00:00.000Z' });
    expect(entscheide({ ...basis, direction: 'outbound', status: 'completed', disposition: 'vm-left', duration: 25 }, null, jetzt).aktion).toBe('sperren');
    expect(entscheide({ ...basis, direction: 'outbound', status: 'completed', duration: 0 }, null, jetzt).aktion).toBe('sperren');
  });
  it('erreicht, eingehend oder laufend → keine Sperre', () => {
    expect(entscheide({ ...basis, direction: 'outbound', status: 'completed', disposition: 'answered', duration: 40 }, null, jetzt)).toEqual({ aktion: 'nichts', grund: 'erreicht' });
    expect(entscheide({ ...basis, direction: 'inbound', status: 'completed', disposition: 'no-answer' }, null, jetzt).aktion).toBe('nichts');
    expect(entscheide({ ...basis, direction: 'outbound', status: 'in-progress' }, null, jetzt)).toEqual({ aktion: 'warten' });
  });
  it('längere Sperre wird nicht verkürzt', () => {
    expect(entscheide({ ...basis, direction: 'outbound', status: 'completed', disposition: 'busy' }, '2027-01-12T10:00:00Z', jetzt)).toEqual({ aktion: 'nichts', grund: 'schon_laenger_gesperrt' });
  });
});
