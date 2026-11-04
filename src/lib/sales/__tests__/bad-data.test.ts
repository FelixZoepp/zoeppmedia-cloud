import { describe, expect, it } from 'vitest';
import { emailFake, pruefeKontakt, telefonFake } from '../bad-data';

describe('telefonFake', () => {
  it.each(['123456789', '0123456789', '+49 123456789', '1234567890', '987654321', '0000000000', '+49 1111111111', '017600000000', '12345', 'abc123', '0049 0176 1234'])(
    '%s ist Bad Data',
    (n) => expect(telefonFake(n)).not.toBeNull(),
  );
  it.each(['+49 176 12345678', '0176 12345678', '01761234567', '4917612345678', '+4915112345678', '030 82684175', '+49 30 82684175', '0821 4567890', '+43 664 1234567', '+41 79 123 45 67', '017612345671'])(
    '%s ist plausibel',
    (n) => expect(telefonFake(n)).toBeNull(),
  );
  it('leer → kein Urteil', () => expect(telefonFake(null)).toBeNull());
});

describe('emailFake', () => {
  it.each(['test@test.de', 'max@mailinator.com', 'asdf@gmail.com', 'aaa@web.de', 'kein-at.de', 'a@b'])('%s ist Bad Data', (e) => expect(emailFake(e)).not.toBeNull());
  it.each(['max.mustermann@gmail.com', 'info@firma.de', 'test.kunde@gmx.de', 'pascal@poppe-vertrieb.de'])('%s ist plausibel', (e) => expect(emailFake(e)).toBeNull());
});

describe('pruefeKontakt', () => {
  it('Fake-Nummer → Bad Data, auch mit echter E-Mail', () => {
    const b = pruefeKontakt({ phone: '123456789', email: 'max@gmail.com' });
    expect(b.badData).toBe(true);
    expect(b.telefonFalsch).toBe(true);
    expect(b.gruende).toEqual(['Telefonnummer ist eine Zahlenreihe']);
  });
  it('echte Nummer + Fake-Mail → kein Bad Data (anrufbar)', () => {
    expect(pruefeKontakt({ phone: '0176 12345678', email: 'test@test.de' }).badData).toBe(false);
  });
  it('ohne Nummer entscheidet die E-Mail', () => {
    expect(pruefeKontakt({ phone: null, email: 'test@test.de' }).badData).toBe(true);
    expect(pruefeKontakt({ phone: null, email: 'max@gmail.com' }).badData).toBe(false);
  });
});
