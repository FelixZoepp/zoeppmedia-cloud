/**
 * Bad Data: offensichtlich erfundene Kontaktdaten aus den Funnels erkennen (rein, testbar).
 *
 * Ausschlaggebend ist die Telefonnummer – über sie laufen Anruf und WhatsApp. Ist sie offensichtlich falsch
 * (Zahlenreihe, gleiche Ziffern, zu kurz/lang, keine gültige deutsche Vorwahl), gilt der Lead als Bad Data.
 * Ohne Telefonnummer entscheidet die E-Mail (Wegwerf-/Test-Adresse, ungültig).
 * Bewusst vorsichtig: lieber einen Fake durchlassen als einen echten Lead wegsortieren.
 */

export const LEAD_STATUS_BAD_DATA = 'stat_KOgUVO1WFOP8s8ONyvCrUMPgTeuplY3YH7nRqUhTUvO';

const REIHE_AUF = '0123456789012345678901234567890';
const REIHE_AB = '9876543210987654321098765432109';

/** Grund, warum die Nummer falsch ist – oder null, wenn sie plausibel ist */
export function telefonFake(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  if (/[a-z]/i.test(raw)) return 'Telefonnummer enthält Buchstaben';
  let d = raw.replace(/\D/g, '');
  const international = /^\s*(\+|00)/.test(raw);
  if (international) d = d.replace(/^00/, '');
  const deutsch = !international || d.startsWith('49');
  // Nationale Rufnummer ohne Länder- und Verkehrsausscheidungsziffer
  // „4917…“ ohne + ist meist die deutsche Nummer mit Ländervorwahl
  const ohnePlus49 = !international && /^49[1-9]\d{8,}$/.test(d);
  const national = international ? (d.startsWith('49') ? d.slice(2) : d.replace(/^\d{1,3}/, '')) : ohnePlus49 ? d.slice(2) : d.replace(/^0/, '');

  if (national.length < 6) return 'Telefonnummer zu kurz';
  if (national.length > 13) return 'Telefonnummer zu lang';
  if (/^(\d)\1+$/.test(national) || /(\d)\1{6,}/.test(national)) return 'Telefonnummer nur aus gleichen Ziffern';
  // Zahlenreihe: die ganze Nummer ist 1234567… oder 9876543…
  if (REIHE_AUF.includes(national) || REIHE_AB.includes(national)) return 'Telefonnummer ist eine Zahlenreihe';
  if (deutsch) {
    if (national.startsWith('1')) {
      // Mobilfunk 015x/016x/017x: 10–11 Stellen ohne 0
      if (!/^1[5-7]/.test(national)) return 'keine gültige deutsche Vorwahl';
      if (national.length < 10 || national.length > 11) return 'Handynummer hat zu wenige/viele Stellen';
    } else if (national.startsWith('0')) {
      return 'keine gültige deutsche Vorwahl';
    } else if (national.length > 11) {
      return 'Telefonnummer zu lang';
    }
  }
  return null;
}

const WEGWERF_DOMAINS = new Set([
  'example.com', 'example.de', 'example.org', 'test.de', 'test.com', 'test.test', 'test.org', 'mustermann.de', 'muster.de',
  'mailinator.com', 'yopmail.com', 'trashmail.com', 'trashmail.de', 'wegwerfmail.de', 'wegwerfmail.net', '10minutemail.com',
  'guerrillamail.com', 'sharklasers.com', 'temp-mail.org', 'tempmail.com', 'tempmail.de', 'byom.de', 'muellmail.com',
  'spambog.com', 'spambog.de', 'emailondeck.com', 'maildrop.cc', 'getnada.com', 'dispostable.com', 'throwawaymail.com',
  'fakeinbox.com', 'trash-mail.com', 'einrot.com', 'mailnesia.com', 'discard.email',
]);
const PLATZHALTER = new Set(['test', 'testtest', 'asdf', 'asd', 'fake', 'keine', 'nein', 'xxx', 'abc', 'qwertz', 'qwerty', 'noreply', 'no-reply', 'nix', 'egal']);

/** Grund, warum die E-Mail falsch ist – oder null, wenn sie plausibel ist */
export function emailFake(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  if (!e) return null;
  const m = /^([^\s@]+)@([^\s@]+\.[a-z]{2,})$/.exec(e);
  if (!m) return 'E-Mail-Adresse ungültig';
  const [, lokal, domain] = m;
  if (WEGWERF_DOMAINS.has(domain)) return 'Wegwerf- oder Test-E-Mail';
  if (PLATZHALTER.has(lokal) || /^(.)\1{2,}$/.test(lokal)) return 'Platzhalter-E-Mail';
  return null;
}

export interface BadDataBefund {
  badData: boolean;
  gruende: string[];
  /** Nummer falsch → keine WhatsApp, kein Anruf möglich */
  telefonFalsch: boolean;
}

export function pruefeKontakt(k: { phone: string | null; email: string | null }): BadDataBefund {
  const tel = telefonFake(k.phone);
  const mail = emailFake(k.email);
  const gruende = [tel, mail].filter((g): g is string => !!g);
  // Mit Telefonnummer zählt die Nummer; ohne Nummer die E-Mail
  const badData = k.phone?.trim() ? !!tel : !!mail;
  return { badData, gruende, telefonFalsch: !!tel };
}
