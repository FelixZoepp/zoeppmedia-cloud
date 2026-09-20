import { describe, it, expect } from 'vitest';
import { canWriteRole } from '../scope';

describe('canWriteRole', () => {
  it.each(['admin', 'employee', 'agency_owner', 'agency_member'])('%s darf schreiben', (r) => {
    expect(canWriteRole(r)).toBe(true);
  });
  it('agency_viewer darf nicht schreiben', () => {
    expect(canWriteRole('agency_viewer')).toBe(false);
  });
  it('unbekannte Rolle darf nicht schreiben', () => {
    expect(canWriteRole('gast')).toBe(false);
  });
});
