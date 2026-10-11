/**
 * CEO-Briefing: Mo–Fr um 7 Uhr (Berlin) eine Zusammenfassung des Vortags für die Geschäftsführung.
 * Montags umfasst „Vortag“ Freitag bis Sonntag.
 * Inhalt: Alarme bei Geschäftszahlen → Sales → Marketing → Kunden & Bewerber → Ausnahmen aus dem Cockpit → offene Entscheidungen.
 * Versand: E-Mail an die Empfänger (system_einstellungen.ceo_briefing, sonst alle Admins) + Glocke/Push,
 * Ansicht in der Cloud unter /admin/briefing. Jede Ausgabe wird in ceo_briefings gespeichert (ein Versand pro Tag).
 * Geht nur an interne Admins – nie an Kunden oder Bewerber.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { quoten } from '@/lib/sales-controlling/tagesbericht';
import { tageZwischen } from '@/lib/sales-controlling/tagesbericht-laden';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { berlinMitternacht, berlinTag } from '@/lib/zeit/berlin';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { ZIEL } from '@/lib/sales-controlling/laden';
import { erfasseKennzahlen, eur, istWerktag, LEER_MARKETING, LEER_SALES, monatsStart, plusTage, summiere, type MarketingTag } from './abendbericht';

export const BRIEFING_STUNDE = 7;
/** Verspätete Jobs (Ausfall) verschicken nach 12 Uhr nichts mehr */
const SPAETESTENS = 12;

type SalesWerte = typeof LEER_SALES;

export type AlarmStufe = 'rot' | 'gelb';
export interface Alarm {
  stufe: AlarmStufe;
  text: string;
  link?: string;
}

export interface BriefingDaten {
  tag: string;
  zeitraum: { von: string; bis: string; label: string };
  alarme: Alarm[];
  sales: {
    abschluesse: number;
    volumen: number;
    settingsGehalten: number;
    settingsNoShow: number;
    closingsGehalten: number;
    closingsNoShow: number;
    settingsGebucht: number;
    closingsGebucht: number;
    showUpSetting: number | null;
    showUpClosing: number | null;
    closingRate: number | null;
    protokolleFehlen: number;
    monat: { volumen: number; abschluesse: number; ziel: number; prognose: number | null; werktageVorbei: number; werktageGesamt: number };
  };
  marketing: { verbunden: boolean; ausgaben: number; leads: number; cpl: number | null; cplSchnitt14: number | null; direktQuote: number | null };
  kunden: { aktiv: number; mrr: number; ampel: { gruen: number; gelb: number; rot: number }; neu: string[]; beendet: string[]; bewerber: number; bewerberWoche: number; bewerberVorwoche: number; starts7: Array<{ name: string; datum: string }> };
  ausnahmen: Array<{ stufe: AlarmStufe; bereich: string; text: string; link?: string }>;
  entscheidungen: Array<{ titel: string; owner: string | null; faellig: string | null }>;
  prioritaeten: Array<{ titel: string; owner: string | null; faellig: string | null }>;
}

function berlinStunde(jetzt: Date): number {
  const teil = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(jetzt).find((x) => x.type === 'hour');
  return Number(teil?.value ?? 0);
}

/** Berichtszeitraum für den Morgen `tag`: Vortag, montags Freitag–Sonntag */
export function berichtsZeitraum(tag: string): { von: string; bis: string; label: string } {
  const bis = plusTage(tag, -1);
  const montag = new Date(`${tag}T12:00:00Z`).getUTCDay() === 1;
  const von = montag ? plusTage(tag, -3) : bis;
  const kurz = (t: string) => new Date(`${t}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  return { von, bis, label: montag ? `Wochenende (${kurz(von)} – ${kurz(bis)})` : `Gestern (${kurz(bis)})` };
}

/** Werktage (Mo–Fr) im Monat von `tag`: gesamt und bis einschließlich `tag` */
export function werktage(tag: string): { vorbei: number; gesamt: number } {
  const start = monatsStart(tag);
  let t = start;
  let vorbei = 0;
  let gesamt = 0;
  while (t.slice(0, 7) === start.slice(0, 7)) {
    if (istWerktag(t)) {
      gesamt++;
      if (t <= tag) vorbei++;
    }
    t = plusTage(t, 1);
  }
  return { vorbei, gesamt };
}

/** Alarme aus den Geschäftszahlen (rein, testbar) – Rotes zuerst */
export function geschaeftsAlarme(e: {
  sales: SalesWerte;
  sales7: SalesWerte;
  marketing: MarketingTag | null;
  cplSchnitt14: number | null;
  monatVolumen: number;
  prognose: number | null;
  werktageVorbei: number;
  roteKunden: number;
  beendet: string[];
}): Alarm[] {
  const a: Alarm[] = [];
  const q = quoten(e.sales);
  if (e.beendet.length) a.push({ stufe: 'rot', text: `Kündigung/Ende: ${e.beendet.join(', ')}`, link: '/clients' });
  if (e.sales7.abschluesse === 0 && e.sales7.closingsGehalten > 0) a.push({ stufe: 'rot', text: `0 Abschlüsse in den letzten 7 Tagen (bei ${e.sales7.closingsGehalten} geführten Closings)`, link: '/admin/vertrieb' });
  if (e.prognose !== null && e.werktageVorbei >= 5 && e.prognose < ZIEL * 0.8)
    a.push({ stufe: e.prognose < ZIEL * 0.6 ? 'rot' : 'gelb', text: `Monatsprognose ${eur(e.prognose)} – ${Math.round((e.prognose / ZIEL) * 100)} % vom Ziel ${eur(ZIEL)}`, link: '/admin/vertrieb' });
  if (e.roteKunden) a.push({ stufe: e.roteKunden >= 3 ? 'rot' : 'gelb', text: `${e.roteKunden} Kunde${e.roteKunden === 1 ? '' : 'n'} auf Rot (Ergebnisse kritisch)`, link: '/ergebnisse' });
  const termineSetting = e.sales.settingsGehalten + e.sales.settingsNoShow;
  if (termineSetting >= 4 && q.showUpSetting !== null && q.showUpSetting < 50) a.push({ stufe: 'gelb', text: `Show-up Settings nur ${q.showUpSetting.toLocaleString('de-DE')} % (${e.sales.settingsNoShow} No-Shows)`, link: '/admin/vertrieb' });
  const termineClosing = e.sales.closingsGehalten + e.sales.closingsNoShow;
  if (termineClosing >= 3 && q.showUpClosing !== null && q.showUpClosing < 60) a.push({ stufe: 'gelb', text: `Show-up Closings nur ${q.showUpClosing.toLocaleString('de-DE')} % (${e.sales.closingsNoShow} No-Shows)`, link: '/admin/vertrieb' });
  if (e.marketing) {
    const leads = e.marketing.eintragungen || e.marketing.metaLeads;
    const cpl = leads > 0 ? e.marketing.ausgaben / leads : null;
    if (cpl !== null && e.cplSchnitt14 !== null && leads >= 3 && cpl > e.cplSchnitt14 * 1.5)
      a.push({ stufe: 'gelb', text: `Kosten pro Lead ${eur(cpl)} – ${Math.round((cpl / e.cplSchnitt14 - 1) * 100)} % über dem 14-Tage-Schnitt (${eur(e.cplSchnitt14)})`, link: '/admin/marketing' });
    if (e.marketing.ausgaben > 50 && leads === 0) a.push({ stufe: 'rot', text: `${eur(e.marketing.ausgaben)} Werbebudget ohne einen einzigen Lead`, link: '/admin/marketing' });
    if (e.marketing.ausgaben === 0 && e.cplSchnitt14 !== null) a.push({ stufe: 'gelb', text: 'Keine Werbeausgaben – laufen die Meta-Kampagnen?', link: '/admin/marketing' });
  }
  if (e.sales.protokolleFehlen >= 3) a.push({ stufe: 'gelb', text: `${e.sales.protokolleFehlen} Gesprächsprotokolle fehlen in Close`, link: '/admin/vertrieb' });
  return a.sort((x, y) => Number(x.stufe === 'gelb') - Number(y.stufe === 'gelb'));
}

/** Briefing berechnen (ohne Versand) */
export async function erstelleBriefing(svc: SupabaseClient, jetzt: Date = new Date()): Promise<BriefingDaten> {
  const tag = berlinTag(jetzt);
  const zeitraum = berichtsZeitraum(tag);
  const tage = tageZwischen(zeitraum.von, zeitraum.bis);

  const [kennzahlen, { ladeCockpit }] = await Promise.all([erfasseKennzahlen(svc, zeitraum.bis), import('@/lib/cockpit/laden')]);
  const cockpit = await ladeCockpit(svc, jetzt);

  const sales = summiere(tage.map((t) => kennzahlen.sales.get(t) ?? LEER_SALES), LEER_SALES);
  const marketing = kennzahlen.metaVerbunden ? summiere(tage.map((t) => kennzahlen.marketing.get(t) ?? LEER_MARKETING), LEER_MARKETING) : null;
  const monat = tageZwischen(monatsStart(zeitraum.bis), zeitraum.bis);
  const monatSales = summiere(monat.map((t) => kennzahlen.sales.get(t) ?? LEER_SALES), LEER_SALES);

  // Letzte 7 und 14 Tage aus kennzahlen_tage (vor dem Berichtszeitraum für den CPL-Schnitt)
  const von14 = plusTage(zeitraum.von, -14);
  const { data: hist } = await svc.from('kennzahlen_tage').select('tag, bereich, werte').gte('tag', von14).lte('tag', zeitraum.bis);
  const h = (hist ?? []) as Array<{ tag: string; bereich: string; werte: Record<string, number> }>;
  const vor = h.filter((x) => x.bereich === 'marketing' && x.tag < zeitraum.von).map((x) => x.werte as unknown as MarketingTag);
  const m14 = summiere(vor, LEER_MARKETING);
  const leads14 = m14.eintragungen || m14.metaLeads;
  const cplSchnitt14 = leads14 >= 5 ? m14.ausgaben / leads14 : null;
  const von7 = plusTage(zeitraum.bis, -6);
  const sales7 = summiere(
    h.filter((x) => x.bereich === 'sales' && x.tag >= von7).map((x) => x.werte as unknown as SalesWerte),
    LEER_SALES,
  );

  const wt = werktage(zeitraum.bis);
  const prognose = wt.vorbei > 0 ? Math.round((monatSales.volumen / wt.vorbei) * wt.gesamt) : null;

  // Kunden: neu / beendet im Zeitraum, Bewerber im Zeitraum
  const [y1, m1, d1] = zeitraum.von.split('-').map(Number);
  const [y2, m2, d2] = zeitraum.bis.split('-').map(Number);
  const vonIso = berlinMitternacht(y1, m1, d1).toISOString();
  const bisIso = berlinMitternacht(y2, m2, d2 + 1).toISOString();
  const hidden = `(${HIDDEN_AGENCY_IDS.join(',')})`;
  const [{ data: neuAg }, { data: endAg }, { count: bewerber }] = await Promise.all([
    svc.from('agencies').select('name').gte('created_at', vonIso).lt('created_at', bisIso).neq('id', SALES_AGENCY_ID).not('id', 'in', hidden),
    svc.from('agencies').select('name').eq('fulfillment_phase', 'beendet').gte('fulfillment_phase_seit', vonIso).lt('fulfillment_phase_seit', bisIso).not('id', 'in', hidden),
    svc.from('candidates').select('id', { count: 'exact', head: true }).is('deleted_at', null).neq('agency_id', SALES_AGENCY_ID).not('agency_id', 'in', hidden).gte('created_at', vonIso).lt('created_at', bisIso),
  ]);
  const neu = ((neuAg ?? []) as Array<{ name: string }>).map((a) => a.name);
  const beendet = ((endAg ?? []) as Array<{ name: string }>).map((a) => a.name);

  const q = quoten(sales);
  const leads = marketing ? marketing.eintragungen || marketing.metaLeads : 0;
  const offen = (p: { status: string }) => p.status === 'offen';
  const punkt = (p: { titel: string; owner_name: string | null; faellig_am: string | null }) => ({ titel: p.titel, owner: p.owner_name, faellig: p.faellig_am });

  return {
    tag,
    zeitraum,
    alarme: geschaeftsAlarme({ sales, sales7, marketing, cplSchnitt14, monatVolumen: monatSales.volumen, prognose, werktageVorbei: wt.vorbei, roteKunden: cockpit.kunden.ampel.rot, beendet }),
    sales: {
      abschluesse: sales.abschluesse,
      volumen: sales.volumen,
      settingsGehalten: sales.settingsGehalten,
      settingsNoShow: sales.settingsNoShow,
      closingsGehalten: sales.closingsGehalten,
      closingsNoShow: sales.closingsNoShow,
      settingsGebucht: sales.settingsGebucht,
      closingsGebucht: sales.closingsGebucht,
      showUpSetting: q.showUpSetting,
      showUpClosing: q.showUpClosing,
      closingRate: q.closingRate,
      protokolleFehlen: sales.protokolleFehlen,
      monat: { volumen: monatSales.volumen, abschluesse: monatSales.abschluesse, ziel: ZIEL, prognose, werktageVorbei: wt.vorbei, werktageGesamt: wt.gesamt },
    },
    marketing: {
      verbunden: !!marketing,
      ausgaben: marketing?.ausgaben ?? 0,
      leads,
      cpl: marketing && leads > 0 ? marketing.ausgaben / leads : null,
      cplSchnitt14,
      direktQuote: marketing ? quoten({ ...LEER_SALES, eintragungen: marketing.eintragungen, direktGebucht: marketing.direktGebucht }).direktQuote : null,
    },
    kunden: {
      aktiv: cockpit.kunden.aktiv,
      mrr: cockpit.mrr.summe,
      ampel: cockpit.kunden.ampel,
      neu,
      beendet,
      bewerber: bewerber ?? 0,
      bewerberWoche: cockpit.bewerber.woche,
      bewerberVorwoche: cockpit.bewerber.vorwoche,
      starts7: cockpit.fulfillment.starts7.map((s) => ({ name: s.name, datum: s.datum })),
    },
    ausnahmen: cockpit.ausnahmen.slice(0, 8),
    entscheidungen: cockpit.entscheidungen.filter(offen).slice(0, 5).map(punkt),
    prioritaeten: cockpit.prioritaeten.filter(offen).slice(0, 5).map(punkt),
  };
}

/* ── Darstellung ───────────────────────────────────────────────── */

const z = (n: number) => n.toLocaleString('de-DE');
const pz = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE')} %`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BASIS = 'https://cloud.zoeppmedia.de';

/** Kurzfassung für Push/Glocke */
export function kurzfassung(b: BriefingDaten): { titel: string; text: string } {
  const rot = b.alarme.filter((a) => a.stufe === 'rot').length;
  const teile = [
    `🏆 ${z(b.sales.abschluesse)} Abschl. · ${eur(b.sales.volumen)}`,
    `🗓️ ${z(b.sales.settingsGehalten)} Settings · 🤝 ${z(b.sales.closingsGehalten)} Closings`,
    b.marketing.verbunden ? `🧲 ${z(b.marketing.leads)} Leads${b.marketing.cpl !== null ? ` à ${eur(b.marketing.cpl)}` : ''}` : null,
    `👥 ${z(b.kunden.bewerber)} Bewerber`,
  ].filter(Boolean);
  return {
    titel: `☀️ CEO-Briefing${b.alarme.length ? ` · ${rot ? `🔴 ${rot}` : ''}${rot && b.alarme.length - rot ? ' ' : ''}${b.alarme.length - rot ? `🟡 ${b.alarme.length - rot}` : ''}` : ' · ✅ alles im Plan'}`,
    text: teile.join(' · '),
  };
}

function zeile(label: string, wert: string) {
  return `<tr><td style="padding:4px 0;color:#6b7280;font-size:14px">${label}</td><td style="padding:4px 0;text-align:right;font-size:14px;font-weight:600;color:#111827">${wert}</td></tr>`;
}

function block(titel: string, inhalt: string) {
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;margin:0 0 14px"><div style="font-size:15px;font-weight:700;margin:0 0 8px;color:#111827">${titel}</div>${inhalt}</div>`;
}

/** Inhalt (ohne html/body) – für die Mail und die Ansicht /admin/briefing */
export function briefingInhalt(b: BriefingDaten): string {
  const s = b.sales;
  const anteil = s.monat.volumen / s.monat.ziel;
  const balken = `<div style="height:8px;background:#f3f4f6;border-radius:99px;overflow:hidden;margin:8px 0 2px"><div style="height:8px;width:${Math.min(100, Math.round(anteil * 100))}%;background:#dc2626"></div></div>`;
  const alarme = b.alarme.length
    ? b.alarme.map((a) => `<div style="padding:6px 0;font-size:14px">${a.stufe === 'rot' ? '🔴' : '🟡'} ${a.link ? `<a href="${BASIS}${a.link}" style="color:#111827">${esc(a.text)}</a>` : esc(a.text)}</div>`).join('')
    : '<div style="font-size:14px">✅ Keine Auffälligkeiten – alles im Plan.</div>';
  const liste = (xs: Array<{ titel: string; owner: string | null; faellig: string | null }>) =>
    xs.map((p) => `<div style="padding:4px 0;font-size:14px">• ${esc(p.titel)}${p.owner ? ` <span style="color:#6b7280">(${esc(p.owner)}${p.faellig ? `, bis ${new Date(`${p.faellig}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}` : ''})</span>` : ''}</div>`).join('');

  const teile = [
    block('🚨 Auf einen Blick', alarme),
    block(
      `💼 Sales · ${esc(b.zeitraum.label)}`,
      `<table style="width:100%;border-collapse:collapse">${[
        zeile('🏆 Abschlüsse', `${z(s.abschluesse)} · ${eur(s.volumen)}`),
        zeile('🤝 Closings geführt', `${z(s.closingsGehalten)} (Show-up ${pz(s.showUpClosing)})`),
        zeile('📈 Closing-Rate', pz(s.closingRate)),
        zeile('🗓️ Settings geführt', `${z(s.settingsGehalten)} (Show-up ${pz(s.showUpSetting)})`),
        zeile('➕ Neu gebucht', `${z(s.settingsGebucht)} Settings · ${z(s.closingsGebucht)} Closings`),
      ].join('')}</table>
      <div style="margin-top:10px;font-size:13px;color:#6b7280">🎯 Monat: <b style="color:#111827">${eur(s.monat.volumen)}</b> von ${eur(s.monat.ziel)} (${Math.round(anteil * 100)} %) · ${z(s.monat.abschluesse)} Abschlüsse${s.monat.prognose !== null ? ` · Prognose <b style="color:#111827">${eur(s.monat.prognose)}</b>` : ''}</div>${balken}
      <div style="font-size:12px;color:#9ca3af">Werktag ${s.monat.werktageVorbei} von ${s.monat.werktageGesamt}</div>`,
    ),
    block(
      `📣 Marketing · ${esc(b.zeitraum.label)}`,
      b.marketing.verbunden
        ? `<table style="width:100%;border-collapse:collapse">${[
            zeile('💸 Ausgaben', eur(b.marketing.ausgaben)),
            zeile('🧲 Leads', z(b.marketing.leads)),
            zeile('🎯 Kosten pro Lead', `${b.marketing.cpl === null ? '–' : eur(b.marketing.cpl)}${b.marketing.cplSchnitt14 !== null ? ` <span style="color:#9ca3af;font-weight:400">(Ø 14 T: ${eur(b.marketing.cplSchnitt14)})</span>` : ''}`),
            zeile('⚡ Direkt gebucht', pz(b.marketing.direktQuote)),
          ].join('')}</table>`
        : '<div style="font-size:14px">⚠️ Meta Ads nicht verbunden.</div>',
    ),
    block(
      '👥 Kunden & Bewerber',
      `<table style="width:100%;border-collapse:collapse">${[
        zeile('🏢 Aktive Kunden', `${z(b.kunden.aktiv)} · MRR ${eur(b.kunden.mrr)}`),
        zeile('🚦 Ampel', `🟢 ${b.kunden.ampel.gruen} · 🟡 ${b.kunden.ampel.gelb} · 🔴 ${b.kunden.ampel.rot}`),
        zeile('📥 Bewerber', `${z(b.kunden.bewerber)} · Woche ${z(b.kunden.bewerberWoche)} (Vorwoche ${z(b.kunden.bewerberVorwoche)})`),
        ...(b.kunden.neu.length ? [zeile('🎉 Neue Kunden', esc(b.kunden.neu.join(', ')))] : []),
        ...(b.kunden.beendet.length ? [zeile('👋 Beendet', esc(b.kunden.beendet.join(', ')))] : []),
        ...(b.kunden.starts7.length ? [zeile('🚀 Starts in 7 Tagen', esc(b.kunden.starts7.map((x) => x.name).join(', ')))] : []),
      ].join('')}</table>`,
    ),
    ...(b.ausnahmen.length
      ? [block('⚠️ Ausnahmen aus dem Cockpit', b.ausnahmen.map((a) => `<div style="padding:4px 0;font-size:14px">${a.stufe === 'rot' ? '🔴' : '🟡'} <span style="color:#6b7280">${esc(a.bereich)}:</span> ${esc(a.text)}</div>`).join(''))]
      : []),
    ...(b.entscheidungen.length ? [block('🧭 Offene Entscheidungen', liste(b.entscheidungen))] : []),
    ...(b.prioritaeten.length ? [block('📌 Prioritäten', liste(b.prioritaeten))] : []),
  ];

  return `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="font-size:22px;font-weight:800;color:#111827;margin:0 0 4px">☀️ Guten Morgen, Felix</div>
<div style="font-size:14px;color:#6b7280;margin:0 0 18px">Dein Briefing für ${new Date(`${b.tag}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</div>
${teile.join('\n')}
<div style="text-align:center;margin:20px 0"><a href="${BASIS}/admin/briefing" style="background:#dc2626;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700;font-size:14px">In der Cloud öffnen</a></div>
</div>`;
}

export function briefingHtml(b: BriefingDaten): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f4f2">${briefingInhalt(b)}</body></html>`;
}

/* ── Planung & Versand ─────────────────────────────────────────── */

/** Tick: Mo–Fr ab 7 Uhr einmal planen */
export async function planeCeoBriefing(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  const stunde = berlinStunde(jetzt);
  if (stunde < BRIEFING_STUNDE || stunde >= SPAETESTENS) return;
  const tag = berlinTag(jetzt);
  if (!istWerktag(tag)) return;
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'berichte.ceo',
    run_at: jetzt.toISOString(),
    payload: { tag },
    status: 'pending',
    dedupe_key: `berichte.ceo:${tag}`,
  });
  if (error && error.code !== '23505') console.error('[ceo-briefing] nicht geplant:', error.message);
}

interface Empfaenger {
  id: string;
  name: string;
  email: string | null;
}

/** Empfänger: system_einstellungen.ceo_briefing = {"user_ids": [...]} – sonst alle Admins */
async function ladeEmpfaenger(svc: SupabaseClient): Promise<Empfaenger[]> {
  const { data: einst } = await svc.from('system_einstellungen').select('wert').eq('key', 'ceo_briefing').maybeSingle();
  let ids: string[] | null = null;
  try {
    const w = (einst as { wert: unknown } | null)?.wert;
    const obj = typeof w === 'string' ? JSON.parse(w) : w;
    if (obj && Array.isArray((obj as { user_ids?: unknown }).user_ids)) ids = (obj as { user_ids: string[] }).user_ids;
  } catch {
    /* Standard: alle Admins */
  }
  let q = svc.from('users').select('id, name, email').eq('role', 'admin');
  if (ids) q = q.in('id', ids);
  const { data } = await q;
  return (data ?? []) as Empfaenger[];
}

/** Job 'berichte.ceo': Briefing berechnen, speichern (einmal pro Tag), per Mail + Push verschicken */
export async function sendeCeoBriefing(svc: SupabaseClient, tag: string, jetzt: Date = new Date()): Promise<{ gesendet: number; uebersprungen?: string }> {
  if (tag !== berlinTag(jetzt) || berlinStunde(jetzt) >= SPAETESTENS) return { gesendet: 0, uebersprungen: 'zu spät' };
  const daten = await erstelleBriefing(svc, jetzt);
  // Tag zuerst beanspruchen → nie zwei Briefings am selben Tag
  const { error: claim } = await svc.from('ceo_briefings').insert({ tag, daten });
  if (claim?.code === '23505') return { gesendet: 0, uebersprungen: 'bereits verschickt' };
  if (claim) throw new Error(`Briefing nicht gespeichert: ${claim.message}`);

  const empfaenger = await ladeEmpfaenger(svc);
  const { titel, text } = kurzfassung(daten);
  const html = briefingHtml(daten);
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY || '');
  const { createNotification } = await import('@/lib/notifications/create');
  let gesendet = 0;
  const fehler: string[] = [];
  for (const u of empfaenger) {
    await createNotification(svc, { user_id: u.id, title: titel, body: text, type: 'system', push_url: '/admin/briefing' }).catch((e) => fehler.push(`Push ${u.name}: ${e}`));
    if (!u.email) continue;
    const { error } = await resend.emails.send({ from: 'Zoepp Cloud <noreply@zoepp-gruppe.de>', to: u.email, subject: titel, html });
    if (error) fehler.push(`Mail ${u.name}: ${error.message}`);
    else gesendet++;
  }
  await svc.from('ceo_briefings').update({ gesendet_am: new Date().toISOString(), fehler: fehler.length ? fehler.join(' | ') : null }).eq('tag', tag);
  // Kein Retry (sonst doppelte Mails) – Fehler stehen am Briefing
  if (fehler.length) console.error('[ceo-briefing]', fehler.join(' | '));
  return { gesendet };
}
