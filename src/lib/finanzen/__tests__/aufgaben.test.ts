import { describe, expect, it } from 'vitest';
import { planeFinanzAufgaben } from '../aufgaben';
import type { FinanzRechnung } from '../zahlungen';
import type { FinanzVertrag } from '../cashplan';

const r = (p: Partial<FinanzRechnung>): FinanzRechnung => ({
  voucher_id: 'v',
  nummer: 'RE1',
  contact_id: 'k1',
  kontakt: 'Kunde',
  datum: '2026-09-01',
  faellig: '2026-09-08',
  brutto: 2380,
  netto: 2000,
  offen: 2380,
  status: 'overdue',
  bezahlt_am: null,
  ...p,
});
const v = (p: Partial<FinanzVertrag> & { lex_contact_id?: string | null }) =>
  ({ id: 'x', kunde: 'X', monatlich: 1000, setup: 0, setup_monat: null, start: '2026-10-01', laufzeit_monate: 3, verlaengerung_monatlich: null, ust_satz: 19, rechnungstag: 1, status: 'aktiv', notiz: null, ...p }) as FinanzVertrag & { lex_contact_id?: string | null };

describe('Finanz-Aufgaben', () => {
  it('Zahlung nachfragen, Start klären bei nicht gestarteten, alte Rechnungen ignorieren', () => {
    const a = planeFinanzAufgaben(
      [
        r({ voucher_id: 'a', nummer: 'RE0550', kontakt: 'Rönnefahrt UG', contact_id: 'ron' }),
        r({ voucher_id: 'b', nummer: 'RE0001', datum: '2023-11-28' }),
        r({ voucher_id: 'c', status: 'open', faellig: '2026-10-29' }),
      ],
      [v({ id: 'ron', kunde: 'Rönnefahrt UG', status: 'startet', lex_contact_id: 'ron', start: '2026-11-01' })],
      '2026-10-30',
    );
    const zahlung = a.filter((x) => x.board === 'Buchhaltung (Petra)');
    expect(zahlung).toHaveLength(1);
    expect(zahlung[0].title).toMatch(/^Start \+ Zahlung klären: Rönnefahrt UG – RE0550/);
    expect(zahlung[0].priority).toBe('high');
    expect(zahlung[0].quelle_ref).toBe('finanz:zahlung:a');
  });

  it('Verlängerung 60 Tage vor Laufzeitende, unbefristet nicht', () => {
    const a = planeFinanzAufgaben([], [v({ id: 'm', kunde: 'Major Vertrieb', start: '2026-10-01', laufzeit_monate: 3 }), v({ id: 'h', kunde: 'Hoffmann', laufzeit_monate: null })], '2026-10-30');
    expect(a.map((x) => x.title)).toEqual(['Verlängerung ansprechen: Major Vertrieb (Laufzeit bis Dezember 2026)']);
    expect(a[0].quelle_ref).toBe('finanz:verlaengerung:m:2026-12');
  });
});
