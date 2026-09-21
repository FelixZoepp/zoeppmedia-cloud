import { describe, it, expect } from 'vitest';
import { getByPath, mapGenericFields } from '@/lib/workers/ingest-generic';

describe('getByPath', () => {
  it('liest verschachtelte Pfade', () => {
    expect(getByPath({ a: { b: { c: 'x' } } }, 'a.b.c')).toBe('x');
  });
  it('fehlender Pfad → null', () => {
    expect(getByPath({ a: 1 }, 'a.b')).toBeNull();
  });
  it('Zahlen werden zu Strings', () => {
    expect(getByPath({ a: 42 }, 'a')).toBe('42');
  });
});

describe('mapGenericFields', () => {
  const body = { vorname: 'Anna', nachname: 'Muster', tel: '0171 999', mail: 'a@b.de', optin: 'yes' };
  const config = {
    fields: { first_name: 'vorname', last_name: 'nachname', phone: 'tel', email: 'mail', consent: 'optin' },
    consent_true_values: ['yes', 'ja', 'true'],
  };
  it('mappt konfigurierte Felder', () => {
    const r = mapGenericFields(body, config);
    expect(r).toMatchObject({ firstName: 'Anna', lastName: 'Muster', phone: '0171 999', email: 'a@b.de', consentWhatsapp: true });
  });
  it('name-Feld wird gesplittet, wenn first/last fehlen', () => {
    const r = mapGenericFields({ full: 'Max Muster', tel: '1' }, { fields: { name: 'full', phone: 'tel' } });
    expect(r.firstName).toBe('Max');
    expect(r.lastName).toBe('Muster');
  });
  it('consent default false', () => {
    const r = mapGenericFields({ tel: '1' }, { fields: { phone: 'tel' } });
    expect(r.consentWhatsapp).toBe(false);
  });
});
