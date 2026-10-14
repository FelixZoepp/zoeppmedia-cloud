import { describe, expect, it } from 'vitest';
import { anzeigeName, handelsregisterPfad, istEigenerPfad, pruefeDatei } from '../handelsregister';
import { bereinigeOnboardingBody } from '../body';

const A = '11111111-2222-3333-4444-555555555555';
const B = '99999999-2222-3333-4444-555555555555';

describe('Handelsregisterauszug', () => {
  it('erlaubt nur PDF/JPG/PNG bis 10 MB', () => {
    expect(pruefeDatei('application/pdf', 300_000)).toBeNull();
    expect(pruefeDatei('image/png', 1)).toBeNull();
    expect(pruefeDatei('application/zip', 1000)).toMatch(/PDF/);
    expect(pruefeDatei('application/pdf', 0)).toMatch(/leer/);
    expect(pruefeDatei('application/pdf', 11 * 1024 * 1024)).toMatch(/groß/);
  });

  it('legt den Pfad im Ordner des Kunden an', () => {
    const p = handelsregisterPfad(A, 'image/jpeg', new Date(1_700_000_000_000));
    expect(p).toBe(`${A}/handelsregister-1700000000000.jpg`);
    expect(istEigenerPfad(p, A)).toBe(true);
  });

  it('akzeptiert keine fremden oder manipulierten Pfade', () => {
    expect(istEigenerPfad(`${B}/handelsregister-1.pdf`, A)).toBe(false);
    expect(istEigenerPfad(`${A}/../${B}/handelsregister-1.pdf`, A)).toBe(false);
    expect(istEigenerPfad(`${A}/logo.png`, A)).toBe(false);
    expect(istEigenerPfad(null, A)).toBe(false);
  });

  it('kürzt Dateinamen und entfernt Pfadteile', () => {
    expect(anzeigeName('C:\\Users\\x\\HR-Auszug.pdf')).toBe('HR-Auszug.pdf');
    expect(anzeigeName('')).toBe('Handelsregisterauszug');
  });

  it('Formular-Body kann den Auszug nicht setzen', () => {
    const b = bereinigeOnboardingBody({ firmen_ort: 'Berlin', handelsregister_pfad: `${B}/handelsregister-1.pdf`, handelsregister_dateiname: 'x' });
    expect(b).toEqual({ firmen_ort: 'Berlin' });
  });
});
