import { describe, expect, it } from 'vitest';
import { berechneTagesbericht, PROTOKOLL_FELDER, PROTOKOLL_TYPEN } from '../tagesbericht';
import type { CloseStatus } from '../compute';

const statuses: CloseStatus[] = [
  { id: 's_set', label: 'Setting - Terminiert', type: 'active' },
  { id: 's_set_ns', label: 'Setting - No Show', type: 'active' },
  { id: 's_clo', label: 'Closing - Terminiert', type: 'active' },
  { id: 's_won', label: 'Close', type: 'won' },
];

describe('berechneTagesbericht', () => {
  const e = berechneTagesbericht({
    tage: ['2026-10-08', '2026-10-07'],
    statuses,
    opps: [
      { id: 'o1', lead_id: 'l1', status_id: 's_won', value: 5000, date_created: '2026-10-07T08:00:00Z', date_won: '2026-10-08', user_id: null },
      { id: 'o2', lead_id: 'l2', status_id: 's_set_ns', value: 0, date_created: '2026-10-07T09:00:00Z', date_won: null, user_id: null },
    ],
    events: [
      { opportunity_id: 'o1', old_status_id: 's_set', new_status_id: 's_clo', date: '2026-10-07T12:00:00Z', user_id: null },
      { opportunity_id: 'o1', old_status_id: 's_clo', new_status_id: 's_won', date: '2026-10-08T10:00:00Z', user_id: null },
      { opportunity_id: 'o2', old_status_id: 's_set', new_status_id: 's_set_ns', date: '2026-10-08T11:00:00Z', user_id: null },
    ],
    anrufe: [
      { lead_id: 'l1', user_id: 'u1', direction: 'outbound', disposition: 'answered', status: null, duration: 120, date: '2026-10-07T10:00:00Z' },
      { lead_id: 'l3', user_id: 'u1', direction: 'outbound', disposition: 'answered', status: null, duration: 90, date: '2026-10-07T11:00:00Z' },
      { lead_id: 'l4', user_id: 'u1', direction: 'outbound', disposition: 'no-answer', status: null, duration: 0, date: '2026-10-07T11:30:00Z' },
    ],
    protokolle: [
      { typ: PROTOKOLL_TYPEN.coldCall, lead_id: 'l1', user_id: 'u1', date: '2026-10-07T10:05:00Z', felder: { [PROTOKOLL_FELDER.entscheiderErgebnis]: 'Setting vereinbart am:' } },
      { typ: PROTOKOLL_TYPEN.setting, lead_id: 'l5', user_id: 'u1', date: '2026-10-08T09:00:00Z', felder: { [PROTOKOLL_FELDER.settingNaechsterSchritt]: '4. Unqualifiziert' } },
    ],
    eintragungen: [
      { eingetragen_am: '2026-10-08T07:00:00Z', ergebnis: 'direkt_gebucht' },
      { eingetragen_am: '2026-10-08T08:00:00Z', ergebnis: 'nicht_gebucht' },
      { eingetragen_am: '2026-10-08T08:30:00Z', ergebnis: 'manuell' },
    ],
    users: new Map([['u1', 'Max Setter']]),
  });
  const tag = (t: string) => e.tage.find((z) => z.tag === t)!;

  it('zählt Telefonie, Entscheider und fehlende Protokolle je Tag', () => {
    expect(tag('2026-10-07')).toMatchObject({ anwahlen: 3, gespraeche: 2, entscheider: 1, protokolleFehlen: 1 });
    expect(e.fehlendeProtokolleJePerson).toEqual([{ name: 'Max Setter', anzahl: 1 }]);
  });

  it('zählt Pipeline-Schritte aus den Statuswechseln und Abschlüsse am Abschlussdatum', () => {
    expect(tag('2026-10-07')).toMatchObject({ settingsGebucht: 2, settingsGehalten: 1, closingsGebucht: 1 });
    expect(tag('2026-10-08')).toMatchObject({ settingsNoShow: 1, settingsUnqualifiziert: 1, closingsGehalten: 1, abschluesse: 1, volumen: 5000 });
  });

  it('zählt Eintragungen ohne manuell angelegte Leads und bildet die Summe', () => {
    expect(tag('2026-10-08')).toMatchObject({ eintragungen: 2, direktGebucht: 1 });
    expect(e.summe).toMatchObject({ anwahlen: 3, abschluesse: 1, eintragungen: 2 });
    expect(e.summe.quoten.showUpSetting).toBe(50);
  });
});
