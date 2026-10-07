/**
 * Admin-Cockpit: alles für das eine Steuerungs-Meeting pro Woche auf einer Seite.
 * Zahlen → Ausnahmen (nur Rotes/Gelbes, mit Link) → Entscheidungen → Prioritäten.
 * Vertrieb (Close) lädt der Browser separat über /api/admin/vertrieb (gecacht, langsamer).
 */

import { MAX_ERINNERUNGEN } from '@/lib/fulfillment/kunden-erinnerung';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ladeErgebnisse } from '@/lib/kunden-cloud/ergebnisse';
import { loadTeamWorkload } from '@/lib/team/workload';
import { HIDDEN_AGENCY_IDS, today } from '@/lib/fulfillment/views';

export type Stufe = 'rot' | 'gelb';

export interface Ausnahme {
  stufe: Stufe;
  bereich: 'Kunden' | 'Fulfillment' | 'Vertrieb' | 'Anfragen' | 'Finanzen' | 'Team' | 'System';
  text: string;
  link?: string;
}

export interface CockpitPunkt {
  id: string;
  typ: 'entscheidung' | 'prioritaet';
  titel: string;
  empfehlung: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  faellig_am: string | null;
  status: 'offen' | 'ja' | 'nein' | 'erledigt' | 'verschoben';
  notiz: string | null;
  erstellt_von_name: string | null;
  created_at: string;
}

export interface CockpitDaten {
  stand: string;
  kunden: { aktiv: number; proPhase: Record<string, number>; ampel: { gruen: number; gelb: number; rot: number } };
  mrr: { summe: number; gepflegt: number; gesamt: number };
  bewerber: { woche: number; vorwoche: number };
  fulfillment: { ueberfaelligTeam: number; ueberfaelligKunde: number; imAufbau: number; starts7: Array<{ id: string; name: string; datum: string }> };
  anfragen: { offen: number; upsell: number };
  team: Array<{ user_id: string; name: string; offen: number; ueberfaellig: number }>;
  wochenbericht: { kw: number; jahr: number; auf_kurs: number; achtung: number; kritisch: number } | null;
  ausnahmen: Ausnahme[];
  entscheidungen: CockpitPunkt[];
  prioritaeten: CockpitPunkt[];
  personen: Array<{ id: string; name: string }>;
}

const TAG = 864e5;

/** Ausnahmen aus den Rohdaten ableiten (rein, testbar) – Rotes zuerst */
export function baueAusnahmen(e: {
  roteKunden: Array<{ id: string; name: string; hinweise: string[] }>;
  ueberfaelligNachOwner: Array<{ name: string; anzahl: number; maxTage: number }>;
  langImAufbau: Array<{ id: string; name: string; phase: string; tage: number; wartet?: 'kunde' | 'uns' }>;
  /** Kunden-Aufgaben trotz aller automatischen Erinnerungen offen → anrufen */
  kundenNachErinnerung?: Array<{ id: string; name: string; offen: number }>;
  kundenAufgabenUeberfaellig: number;
  anfragenAlt: number;
  upsellOffen: number;
  mrrFehlt: number;
  ohneLogin: number;
  jobFehler: number;
  kiUebersteuert: number;
}): Ausnahme[] {
  const a: Ausnahme[] = [];
  for (const k of e.roteKunden) a.push({ stufe: 'rot', bereich: 'Kunden', text: `${k.name}: ${k.hinweise[0] ?? 'Ergebnisse kritisch'}`, link: `/clients/${k.id}` });
  for (const o of e.ueberfaelligNachOwner) {
    a.push({
      stufe: o.maxTage > 7 ? 'rot' : 'gelb',
      bereich: 'Fulfillment',
      text: `${o.name}: ${o.anzahl} Schritt${o.anzahl === 1 ? '' : 'e'} überfällig (ältester ${o.maxTage} Tage)`,
      link: '/clients',
    });
  }
  for (const k of e.langImAufbau) {
    a.push({ stufe: k.tage > 30 ? 'rot' : 'gelb', bereich: 'Fulfillment', text: `${k.name} seit ${k.tage} Tagen in ${k.phase} – Kampagne noch nicht live${k.wartet === 'kunde' ? ' (wartet auf den Kunden)' : k.wartet === 'uns' ? ' (liegt bei uns)' : ''}`, link: `/clients/${k.id}` });
  }
  for (const k of e.kundenNachErinnerung ?? []) {
    a.push({ stufe: 'rot', bereich: 'Kunden', text: `${k.name}: ${k.offen} Aufgabe${k.offen === 1 ? '' : 'n'} trotz 3 Erinnerungen offen – kurz anrufen`, link: `/clients/${k.id}` });
  }
  if (e.kundenAufgabenUeberfaellig) a.push({ stufe: 'gelb', bereich: 'Kunden', text: `${e.kundenAufgabenUeberfaellig} Kunden-Aufgaben überfällig (Zugänge, Formular …) – nachfassen`, link: '/clients' });
  if (e.upsellOffen) a.push({ stufe: 'gelb', bereich: 'Anfragen', text: `${e.upsellOffen} Upsell-Interesse${e.upsellOffen === 1 ? '' : 'n'} wartet auf Rückmeldung`, link: '/admin/support' });
  if (e.anfragenAlt) a.push({ stufe: 'gelb', bereich: 'Anfragen', text: `${e.anfragenAlt} Kunden-Anfrage${e.anfragenAlt === 1 ? '' : 'n'} seit über 2 Tagen offen`, link: '/admin/support' });
  if (e.mrrFehlt) a.push({ stufe: 'gelb', bereich: 'Finanzen', text: `Bei ${e.mrrFehlt} Kunden ist kein MRR hinterlegt – Umsatz und ROI unvollständig`, link: '/admin/finanzen/kunden' });
  if (e.ohneLogin) a.push({ stufe: 'gelb', bereich: 'Kunden', text: `${e.ohneLogin} Kunden ohne Login – bekommen keinen Wochenüberblick`, link: '/admin/wochenberichte' });
  if (e.jobFehler) a.push({ stufe: 'gelb', bereich: 'System', text: `${e.jobFehler} automatische Aufgaben in den letzten 7 Tagen fehlgeschlagen` });
  if (e.kiUebersteuert) a.push({ stufe: 'gelb', bereich: 'Fulfillment', text: `${e.kiUebersteuert} Ads ohne grüne KI-Prüfung zum Kunden geschickt (begründet) – Stichprobe ansehen`, link: '/ads' });
  return a.sort((x, y) => Number(x.stufe === 'gelb') - Number(y.stufe === 'gelb'));
}

export async function ladeCockpit(svc: SupabaseClient, jetzt: Date = new Date()): Promise<CockpitDaten> {
  const heute = today(jetzt);
  const vor7 = new Date(jetzt.getTime() - 7 * TAG).toISOString();
  const vor2 = new Date(jetzt.getTime() - 2 * TAG).toISOString();
  const in7 = new Date(jetzt.getTime() + 7 * TAG).toISOString().slice(0, 10);

  const [ergebnisse, team, { data: ags }, { data: steps }, { data: anfr }, { data: jobs }, { data: kiAds }, { data: users }, { data: punkte }, { data: owners }, { data: wb }] =
    await Promise.all([
      ladeErgebnisse(svc, jetzt),
      loadTeamWorkload(svc, jetzt).catch(() => []),
      svc
        .from('agencies')
        .select('id, name, mrr, fulfillment_phase, fulfillment_phase_seit, launch_datum, pausiert_grund')
        .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`),
      svc.from('client_steps').select('agency_id, step_key, wer, status, faellig_am, owner_user_id, kunde_erinnerungen').in('status', ['offen', 'in_arbeit']),
      svc.from('support_anfragen').select('art, status, created_at').neq('status', 'erledigt'),
      svc.from('scheduled_jobs').select('id').eq('status', 'dead').gte('updated_at', vor7),
      svc.from('ad_items').select('id, ki_override').not('ki_override', 'is', null).gte('updated_at', vor7),
      svc.from('users').select('id, name, role, agency_id, email'),
      svc.from('cockpit_punkte').select('*').order('created_at', { ascending: false }).limit(200),
      svc.from('users').select('id, name').in('role', ['admin', 'employee']),
      svc.from('wochenberichte').select('jahr, kw, status').order('jahr', { ascending: false }).order('kw', { ascending: false }).limit(500),
    ]);

  const agencies = ((ags ?? []) as Array<{ id: string; name: string; mrr: string | number | null; fulfillment_phase: string | null; fulfillment_phase_seit: string | null; launch_datum: string | null; pausiert_grund: string | null }>).filter(
    (a) => a.fulfillment_phase && a.fulfillment_phase !== 'beendet',
  );
  const name = new Map(agencies.map((a) => [a.id, a.name]));
  const personen = new Map(((owners ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));

  // Kunden + Ampel
  const proPhase: Record<string, number> = {};
  for (const a of agencies) proPhase[a.fulfillment_phase!] = (proPhase[a.fulfillment_phase!] ?? 0) + 1;
  const aktiveIds = new Set(agencies.map((a) => a.id));
  const erg = ergebnisse.filter((e) => aktiveIds.has(e.id));
  const ampel = { gruen: 0, gelb: 0, rot: 0 };
  for (const e of erg) ampel[e.ampel]++;
  const vor14b = new Date(jetzt.getTime() - 14 * TAG).toISOString();
  const { count: vorwoche } = await svc
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('agency_id', [...aktiveIds])
    .gte('created_at', vor14b)
    .lt('created_at', vor7);
  const bewerber = { woche: erg.reduce((s, e) => s + e.bewerber7, 0), vorwoche: vorwoche ?? 0 };

  // MRR
  const mrrWerte = agencies.map((a) => (a.mrr === null ? null : Number(a.mrr)));
  const mrr = { summe: mrrWerte.reduce<number>((s, v) => s + (v ?? 0), 0), gepflegt: mrrWerte.filter((v) => v !== null && v > 0).length, gesamt: agencies.length };

  // Fulfillment
  const offen = ((steps ?? []) as Array<{ agency_id: string; step_key: string; wer: string; status: string; faellig_am: string | null; owner_user_id: string | null; kunde_erinnerungen: number | null }>).filter((s) =>
    aktiveIds.has(s.agency_id),
  );
  const ueberfaellig = offen.filter((s) => s.faellig_am && s.faellig_am < heute);
  const team_ = ueberfaellig.filter((s) => s.wer === 'zoepp');
  const kunde_ = ueberfaellig.filter((s) => s.wer === 'kunde');
  const nachOwner = new Map<string, { anzahl: number; maxTage: number }>();
  for (const s of team_) {
    const k = s.owner_user_id ? personen.get(s.owner_user_id) ?? 'Unbekannt' : 'Niemand zugewiesen';
    const tage = Math.round((jetzt.getTime() - new Date(`${s.faellig_am}T00:00:00Z`).getTime()) / TAG);
    const x = nachOwner.get(k) ?? { anzahl: 0, maxTage: 0 };
    nachOwner.set(k, { anzahl: x.anzahl + 1, maxTage: Math.max(x.maxTage, tage) });
  }
  const aufbau = agencies.filter((a) => ['zahlung', 'onboarding', 'setup'].includes(a.fulfillment_phase!));
  const PHASE: Record<string, string> = { zahlung: 'Zahlung', onboarding: 'Onboarding', setup: 'Setup' };
  const langImAufbau = aufbau
    .map((a) => ({
      id: a.id,
      name: a.name,
      phase: PHASE[a.fulfillment_phase!],
      tage: a.fulfillment_phase_seit ? Math.round((jetzt.getTime() - new Date(a.fulfillment_phase_seit).getTime()) / TAG) : 0,
      wartet: (kunde_.some((s) => s.agency_id === a.id) ? 'kunde' : 'uns') as 'kunde' | 'uns',
    }))
    .filter((a) => a.tage > 14 && !agencies.find((x) => x.id === a.id)?.pausiert_grund);
  const nachErinnerung = new Map<string, number>();
  for (const s of kunde_) if ((s.kunde_erinnerungen ?? 0) >= MAX_ERINNERUNGEN) nachErinnerung.set(s.agency_id, (nachErinnerung.get(s.agency_id) ?? 0) + 1);
  // Anstehende Starts: offener Schritt „Kampagne live“ mit Frist in den nächsten 7 Tagen
  const starts7 = offen
    .filter((s) => s.step_key === 's_launch' && s.faellig_am && s.faellig_am <= in7)
    .map((s) => ({ id: s.agency_id, name: name.get(s.agency_id) ?? '–', datum: s.faellig_am! }))
    .sort((a, b) => a.datum.localeCompare(b.datum));

  // Anfragen
  const a_ = (anfr ?? []) as Array<{ art: string; status: string; created_at: string }>;
  const anfragen = { offen: a_.length, upsell: a_.filter((x) => x.art === 'interesse').length };

  // Logins
  const u_ = (users ?? []) as Array<{ id: string; role: string; agency_id: string | null; email: string | null }>;
  const mitLogin = new Set(u_.filter((u) => u.role === 'agency_owner' && u.email).map((u) => u.agency_id));
  const ohneLogin = agencies.filter((a) => !mitLogin.has(a.id)).length;

  // Wochenberichte: letzte KW
  const w_ = (wb ?? []) as Array<{ jahr: number; kw: number; status: 'auf_kurs' | 'achtung' | 'kritisch' }>;
  const letzte = w_[0];
  const wochenbericht = letzte
    ? (() => {
        const diese = w_.filter((x) => x.jahr === letzte.jahr && x.kw === letzte.kw);
        return { kw: letzte.kw, jahr: letzte.jahr, auf_kurs: diese.filter((x) => x.status === 'auf_kurs').length, achtung: diese.filter((x) => x.status === 'achtung').length, kritisch: diese.filter((x) => x.status === 'kritisch').length };
      })()
    : null;

  const ausnahmen = baueAusnahmen({
    roteKunden: erg.filter((e) => e.ampel === 'rot' && !e.pausiert).map((e) => ({ id: e.id, name: e.name, hinweise: e.hinweise })),
    ueberfaelligNachOwner: [...nachOwner.entries()].map(([n, x]) => ({ name: n, ...x })).sort((x, y) => y.maxTage - x.maxTage),
    langImAufbau,
    kundenNachErinnerung: [...nachErinnerung].map(([id, n]) => ({ id, name: name.get(id) ?? '–', offen: n })),
    kundenAufgabenUeberfaellig: kunde_.length,
    anfragenAlt: a_.filter((x) => x.art !== 'interesse' && x.created_at < vor2).length,
    upsellOffen: anfragen.upsell,
    mrrFehlt: mrr.gesamt - mrr.gepflegt,
    ohneLogin,
    jobFehler: (jobs ?? []).length,
    kiUebersteuert: (kiAds ?? []).length,
  });

  const p_ = ((punkte ?? []) as Array<Omit<CockpitPunkt, 'owner_name' | 'erstellt_von_name'> & { erstellt_von: string | null }>).map((p) => ({
    ...p,
    owner_name: p.owner_user_id ? personen.get(p.owner_user_id) ?? null : null,
    erstellt_von_name: p.erstellt_von ? personen.get(p.erstellt_von) ?? null : null,
  }));
  // Offene + in den letzten 14 Tagen entschiedene/erledigte (zum Nachlesen im Meeting)
  const vor14 = new Date(jetzt.getTime() - 14 * TAG).toISOString();
  const sichtbar = (p: { status: string; created_at: string }) => p.status === 'offen' || p.created_at >= vor14;

  return {
    stand: jetzt.toISOString(),
    kunden: { aktiv: agencies.length, proPhase, ampel },
    mrr,
    bewerber,
    fulfillment: { ueberfaelligTeam: team_.length, ueberfaelligKunde: kunde_.length, imAufbau: aufbau.length, starts7 },
    anfragen,
    team: (team as Array<{ user_id: string; name: string; offen: number; ueberfaellig: number }>).map((t) => ({ user_id: t.user_id, name: t.name, offen: t.offen, ueberfaellig: t.ueberfaellig })),
    wochenbericht,
    ausnahmen,
    entscheidungen: p_.filter((p) => p.typ === 'entscheidung' && sichtbar(p)),
    prioritaeten: p_.filter((p) => p.typ === 'prioritaet' && sichtbar(p)),
    personen: [...personen.entries()].map(([id, n]) => ({ id, name: n })).sort((a, b) => a.name.localeCompare(b.name, 'de')),
  };
}
