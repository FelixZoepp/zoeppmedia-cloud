import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBoard, loadCustomerTasks, loadMyTodos } from '@/lib/fulfillment/views';
import { phaseLabel } from '@/lib/fulfillment/catalog';
import { loadTeamWorkload } from '@/lib/team/workload';
import { loadTeamCalendar } from '@/lib/team/calendar';
import { getDashboardData } from '@/lib/dashboard';
import { helpFor, type Audience } from '@/lib/help/articles';
import { ladeErgebnisse } from '@/lib/kunden-cloud/ergebnisse';
import { ladeArbeit } from '@/lib/kunden-cloud/uebersicht';
import { ladeEmpfehlungen } from '@/lib/empfehlungen/laden';
import { erstelleAnfrage } from '@/lib/support/anfragen';
import { ladeSalesControlling, ZEITRÄUME, type Zeitraum } from '@/lib/sales-controlling/laden';
import { KUNDEN_CLOUD_BEREICHE, SALES_BEREICHE } from '@/lib/team/funktionen';

/**
 * Werkzeuge des KI-Assistenten. Alle nur lesend und an die Rolle gebunden:
 * interne Nutzer sehen Team-Daten, Kunden nur ihre eigene Agentur.
 */

export interface ToolContext {
  svc: SupabaseClient;
  userId: string;
  audience: Audience;
  /**
   * Kunde: die eigene Agentur. Intern: die gerade geöffnete Kunden-Cloud (Innendienst), sonst null.
   * Alle Kunden-Werkzeuge lesen ausschließlich diese Agentur – andere Kunden sind technisch nicht erreichbar.
   */
  agencyId: string | null;
  /** Bereich intern (users.funktion), z. B. innendienst, csm, vertrieb */
  funktion?: string | null;
}

interface ToolDef {
  tool: Anthropic.Tool;
  /** Kurzer Text für die Oberfläche („Schaut in deine Aufgaben …“) */
  label: string;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const hilfe: ToolDef = {
  label: 'Sucht im Hilfe-Center',
  tool: {
    name: 'hilfe_suchen',
    description:
      'Durchsucht das Hilfe-Center der Zoepp Cloud nach Anleitungen (wo etwas zu finden ist, wie eine Funktion bedient wird). Nutze es bei Fragen zur Bedienung der Cloud.',
    input_schema: {
      type: 'object',
      properties: { suchbegriff: { type: 'string', description: 'Stichwort, z. B. „Logo“, „Aufgabe verschieben“' } },
      required: ['suchbegriff'],
    },
  },
  run: async (input, ctx) => {
    const q = str(input.suchbegriff).toLowerCase();
    const { articles } = helpFor(ctx.audience);
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    const hits = articles
      .map((a) => ({ a, score: words.filter((w) => `${a.frage} ${a.antwort}`.toLowerCase().includes(w)).length }))
      .filter((x) => x.score > 0 || !words.length)
      .sort((x, y) => y.score - x.score)
      .slice(0, 4)
      .map(({ a }) => ({ frage: a.frage, antwort: a.antwort, link: a.link?.href ?? null }));
    return hits.length ? hits : { hinweis: 'Kein passender Artikel. Antworte aus dem allgemeinen Wissen über die Cloud oder frage nach.' };
  },
};

/* ── Intern (Admin + Mitarbeiter) ──────────────────────────────── */

const meineAufgaben: ToolDef = {
  label: 'Schaut in deine Aufgaben',
  tool: {
    name: 'meine_aufgaben',
    description: 'Offene Aufgaben des angemeldeten Mitarbeiters: Fulfillment-Schritte, Ads, Projekt- und interne Aufgaben mit Kunde, Status und Frist.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_input, ctx) => {
    const [schritte, { data: ads }, { data: projekt }, { data: intern }] = await Promise.all([
      loadMyTodos(ctx.svc, ctx.userId),
      ctx.svc.from('ad_items').select('titel, stage, faellig_am, agency_id').eq('assignee_id', ctx.userId).in('stage', ['idee', 'material', 'bearbeitung', 'bereit']),
      ctx.svc.from('project_tasks').select('titel, status, faellig_am').eq('owner_user_id', ctx.userId).in('status', ['offen', 'in_arbeit', 'blockiert', 'zur_freigabe']),
      ctx.svc.from('internal_tasks').select('title, status, due_date').eq('assigned_to', ctx.userId).in('status', ['backlog', 'todo', 'in_progress', 'review']),
    ]);
    return {
      heute: new Date().toISOString().slice(0, 10),
      fulfillment_schritte: schritte.slice(0, 30).map((s) => ({ kunde: s.agency_name, schritt: s.titel, status: s.status, frist: s.faellig_am, ueberfaellig: s.ueberfaellig })),
      ads: (ads ?? []).slice(0, 20),
      projekt_aufgaben: (projekt ?? []).slice(0, 20),
      interne_aufgaben: (intern ?? []).slice(0, 20),
    };
  },
};

const kundenSuchen: ToolDef = {
  label: 'Schaut in die Kunden-Pipeline',
  tool: {
    name: 'kunden_uebersicht',
    description:
      'Kunden (Agenturen) mit Fulfillment-Phase, aktuellem Schritt, Fortschritt, Überfälligkeit und Blocker. Optional nach Namen filtern. Für Fragen wie „Wo steht Kunde X?“ oder „Welche Kunden hängen?“',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Teil des Kundennamens (optional)' } },
    },
  },
  run: async (input, ctx) => {
    const q = str(input.name).toLowerCase();
    const board = await loadBoard(ctx.svc, null);
    return board
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((c) => ({
        kunde: c.name,
        phase: phaseLabel(c.phase),
        tage_in_phase: c.tage_in_phase,
        fortschritt: `${c.schritte_erledigt}/${c.schritte_gesamt}`,
        aktueller_schritt: c.aktueller_schritt
          ? { titel: c.aktueller_schritt.titel, wer: c.aktueller_schritt.wer === 'kunde' ? 'Kunde' : 'Zoepp', zustaendig: c.aktueller_schritt.owner_name, frist: c.aktueller_schritt.faellig_am, ueberfaellig: c.aktueller_schritt.ueberfaellig }
          : null,
        blocker: c.pausiert_grund,
      }));
  },
};

const teamAuslastung: ToolDef = {
  label: 'Prüft die Team-Auslastung',
  tool: {
    name: 'team_auslastung',
    description: 'Auslastung je Mitarbeiter: offene und in 30 Tagen erledigte Aufgaben, Überfälliges, Auslastung in Prozent (20 offene = 100 %, Überfälliges zählt doppelt).',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_input, ctx) =>
    (await loadTeamWorkload(ctx.svc)).map((w) => ({
      name: w.name,
      funktion: w.funktion,
      offen: w.offen,
      ueberfaellig: w.ueberfaellig,
      erledigt_30_tage: w.erledigt_30d,
      auslastung_prozent: w.workload,
    })),
};

const kalender: ToolDef = {
  label: 'Schaut in den Team-Kalender',
  tool: {
    name: 'team_kalender',
    description: 'Termine (Calendly) und offene Fristen des Teams in einem Zeitraum (höchstens ~60 Tage).',
    input_schema: {
      type: 'object',
      properties: {
        von: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        bis: { type: 'string', description: 'Enddatum YYYY-MM-DD' },
      },
      required: ['von', 'bis'],
    },
  },
  run: async (input, ctx) => {
    const von = str(input.von, 10);
    const bis = str(input.bis, 10);
    if (!DAY.test(von) || !DAY.test(bis) || von > bis) return { fehler: 'von/bis bitte als YYYY-MM-DD angeben' };
    if (new Date(bis).getTime() - new Date(von).getTime() > 62 * 864e5) return { fehler: 'Zeitraum zu groß (max. 60 Tage)' };
    const entries = await loadTeamCalendar(ctx.svc, von, bis);
    return entries.slice(0, 60).map((e) => ({
      tag: e.tag,
      uhrzeit: e.start ? new Date(e.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) : null,
      art: e.kind,
      titel: e.titel,
      kunde_oder_info: e.untertitel,
      zustaendig: e.personen.map((p) => p.name),
      ueberfaellig: e.ueberfaellig,
    }));
  },
};

/* ── Kunde (Agentur) ───────────────────────────────────────────── */

const recruitingZahlen: ToolDef = {
  label: 'Schaut in deine Recruiting-Zahlen',
  tool: {
    name: 'recruiting_zahlen',
    description: 'Recruiting-Kennzahlen der eigenen Agentur: Bewerber gesamt, neu diese Woche, eingestellt, Verteilung nach Quelle und Phase, Werbebudgets.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_input, ctx) => {
    if (!ctx.agencyId) return { fehler: 'Keine Agentur zugeordnet' };
    const d = await getDashboardData(ctx.agencyId);
    return {
      bewerber_gesamt: d.totalCandidates,
      neu_diese_woche: d.newThisWeek,
      eingestellt: d.hired,
      hire_rate_prozent: d.totalCandidates ? Math.round((d.hired / d.totalCandidates) * 100) : 0,
      nach_quelle: d.sourceBreakdown,
      nach_phase: d.stageBreakdown.map((s) => ({ phase: s.name, anzahl: s.count })),
      meta_tagesbudget: d.metaDailyBudget,
      indeed_tagesbudget: d.indeedDailyBudget,
    };
  },
};

const bewerberSuchen: ToolDef = {
  label: 'Sucht in deinen Bewerbern',
  tool: {
    name: 'bewerber_suchen',
    description: 'Sucht Bewerber der eigenen Agentur nach Name, Telefonnummer oder E-Mail und liefert Phase, Quelle und Eingangsdatum.',
    input_schema: {
      type: 'object',
      properties: { suchbegriff: { type: 'string', description: 'Name, Nummer oder E-Mail' } },
      required: ['suchbegriff'],
    },
  },
  run: async (input, ctx) => {
    if (!ctx.agencyId) return { fehler: 'Keine Agentur zugeordnet' };
    const q = str(input.suchbegriff, 60).replace(/[,()%]/g, '');
    if (q.length < 2) return { fehler: 'Bitte mindestens 2 Zeichen' };
    const { data } = await ctx.svc
      .from('candidates')
      .select('name, phone_e164, email, source, created_at, current_stage:pipeline_stages(name)')
      .eq('agency_id', ctx.agencyId)
      .is('deleted_at', null)
      .or(`name.ilike.%${q}%,phone_e164.ilike.%${q}%,email.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(10);
    return data ?? [];
  },
};

const deineAufgaben: ToolDef = {
  label: 'Schaut in deine offenen Aufgaben',
  tool: {
    name: 'deine_aufgaben',
    description: 'Offene Schritte, die gerade beim Kunden liegen (z. B. Zugänge freigeben, Inhalte hochladen), plus aktuelle Projektphase.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_input, ctx) => {
    if (!ctx.agencyId) return { fehler: 'Keine Agentur zugeordnet' };
    const t = await loadCustomerTasks(ctx.svc, ctx.agencyId);
    return {
      phase: phaseLabel(t.phase),
      offen: t.offen.map((s) => ({ schritt: s.titel, frist: s.faellig_am, ueberfaellig: s.ueberfaellig, beschreibung: s.beschreibung })),
      wird_geprueft: t.in_pruefung.map((s) => s.titel),
    };
  },
};

/* ── Kunde: Ergebnisse, Empfehlungen, Interesse ───────────────── */

const meineErgebnisse: ToolDef = {
  label: 'Wertet deine Ergebnisse aus',
  tool: {
    name: 'meine_ergebnisse',
    description:
      'Ergebnisse der eigenen Agentur der letzten 30 Tage: Bewerber (mit Vormonat), offen/unbearbeitet, kontaktiert in %, Zeit bis zum ersten Kontakt, Anrufe, Erreichbarkeit, Termine, No-Shows, Einstellungen, WhatsApp verbunden, Masterclass-Fortschritt.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_input, ctx) => {
    if (!ctx.agencyId) return { fehler: 'Keine Agentur zugeordnet' };
    const { lage } = await ladeEmpfehlungen(ctx.svc, ctx.agencyId);
    return lage ?? { hinweis: 'Noch keine Daten vorhanden' };
  },
};

const empfehlungen: ToolDef = {
  label: 'Sucht passende Empfehlungen',
  tool: {
    name: 'empfehlungen',
    description:
      'Empfehlungen für die eigene Agentur aus den aktuellen Zahlen: „tipp“ = sofort umsetzbar in der Cloud (mit Link), „leistung“ = Zusatzleistung/Paket von Zoepp Media. Liefert Titel, Begründung mit Zahlen und Nutzen.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_input, ctx) => {
    if (!ctx.agencyId) return { fehler: 'Keine Agentur zugeordnet' };
    const { empfehlungen: liste } = await ladeEmpfehlungen(ctx.svc, ctx.agencyId);
    return liste.map((e) => ({ id: e.id, art: e.art, titel: e.titel, warum: e.warum, nutzen: e.nutzen, link: e.link?.href ?? null }));
  },
};

const interesseMelden: ToolDef = {
  label: 'Gibt deinem Ansprechpartner Bescheid',
  tool: {
    name: 'interesse_melden',
    description:
      'Meldet das Interesse des Kunden an einer Zusatzleistung oder einen Rückrufwunsch an seinen Ansprechpartner bei Zoepp Media. NUR aufrufen, nachdem der Kunde ausdrücklich zugestimmt hat („Ja, gib Bescheid“).',
    input_schema: {
      type: 'object',
      properties: {
        thema: { type: 'string', description: 'Worum es geht, z. B. „Karriere-Website“ oder „Mehr Werbebudget“' },
        empfehlung_id: { type: 'string', description: 'ID aus „empfehlungen“, falls vorhanden' },
        nachricht: { type: 'string', description: 'Kurze Notiz mit dem Anliegen des Kunden' },
      },
      required: ['thema'],
    },
  },
  run: async (input, ctx) => {
    if (!ctx.agencyId) return { fehler: 'Keine Agentur zugeordnet' };
    const { id } = await erstelleAnfrage(ctx.svc, {
      agencyId: ctx.agencyId,
      userId: ctx.userId,
      art: 'interesse',
      thema: str(input.thema, 120) || 'Interesse',
      nachricht: str(input.nachricht, 1000) || 'Über den KI-Assistenten gemeldet',
      empfehlungId: str(input.empfehlung_id, 60) || null,
    });
    return { ok: true, anfrage_id: id, hinweis: 'Der Ansprechpartner ist informiert und meldet sich.' };
  },
};

/* ── Intern: Auswertungen ──────────────────────────────────────── */

const kundenErgebnisse: ToolDef = {
  label: 'Wertet die Kunden-Ergebnisse aus',
  tool: {
    name: 'kunden_ergebnisse',
    description:
      'Recruiting-Ergebnisse aller Kunden (30 Tage): Bewerber mit Vormonat, Kontaktquote, Speed-to-Lead, Anrufe, Erreichbarkeit, Termine, No-Shows, Einstellungen, Ampel (rot/gelb/grün) mit Hinweisen. Optional nach Kundenname filtern.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Teil des Kundennamens (optional)' } } },
  },
  run: async (input, ctx) => {
    const q = str(input.name).toLowerCase();
    return (await ladeErgebnisse(ctx.svc))
      .filter((k) => !q || k.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((k) => ({
        kunde: k.name, phase: k.phase, pausiert: k.pausiert, ampel: k.ampel, hinweise: k.hinweise,
        bewerber_30_tage: k.bewerber30, bewerber_vormonat: k.bewerberVorher, kontaktquote: k.kontaktquote,
        speed_to_lead_min: k.speedToLeadMin, anrufe: k.anrufe30, erreichbarkeit: k.erreichbarkeit,
        termine: k.termine30, no_shows: k.noShows30, einstellungen: k.einstellungen30,
      }));
  },
};

const innendienstArbeit: ToolDef = {
  label: 'Schaut, wo im Innendienst Arbeit liegt',
  tool: {
    name: 'innendienst_arbeit',
    description:
      'Je Kunde: neue Bewerber zu bearbeiten, ohne Kontakt, heute neu, fällige Anrufe, ungelesene WhatsApps, ältester Bewerber ohne Kontakt – sortiert nach Dringlichkeit.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_input, ctx) =>
    (await ladeArbeit(ctx.svc)).slice(0, 25).map((k) => ({
      kunde: k.name,
      pausiert: k.pausiert,
      zu_bearbeiten: k.zuBearbeiten,
      ohne_kontakt: k.ohneKontakt,
      heute_neu: k.neuHeute,
      anrufe_faellig: k.anrufeFaellig,
      ungelesen: k.ungelesen,
      aeltester_ohne_kontakt_seit: k.aeltesterOhneKontakt,
    })),
};

const kundenChancen: ToolDef = {
  label: 'Sucht Upsell-Chancen',
  tool: {
    name: 'kunden_chancen',
    description: 'Empfehlungen und Upsell-Chancen für einen bestimmten Kunden aus seinen aktuellen Zahlen (Tipps und Zusatzleistungen mit Begründung).',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Kundenname (Teil reicht)' } }, required: ['name'] },
  },
  run: async (input, ctx) => {
    const q = str(input.name).toLowerCase();
    if (q.length < 2) return { fehler: 'Bitte Kundennamen angeben' };
    const { data } = await ctx.svc.from('agencies').select('id, name').ilike('name', `%${q.replace(/[%_]/g, '')}%`).limit(3);
    const treffer = (data ?? []) as Array<{ id: string; name: string }>;
    if (!treffer.length) return { fehler: 'Kein Kunde gefunden' };
    return Promise.all(
      treffer.map(async (a) => {
        const { lage, empfehlungen: liste } = await ladeEmpfehlungen(ctx.svc, a.id);
        return { kunde: a.name, paket: lage?.paket ?? null, empfehlungen: liste.map((e) => ({ art: e.art, titel: e.titel, warum: e.warum, nutzen: e.nutzen })) };
      }),
    );
  },
};

const salesKennzahlen: ToolDef = {
  label: 'Schaut ins Sales-Controlling',
  tool: {
    name: 'sales_kennzahlen',
    description:
      'Sales-Controlling (Close + Meta): Auftragsvolumen vs. Ziel 300.000 €/Monat, Hochrechnung, Forecast, Setting/Closing mit Show-Quoten, Marketing-Kosten, Pipeline, Telefonie, Follow-ups, Problemfelder. Zeitraum: monat, vormonat, quartal, letztesquartal, 90tage, jahr.',
    input_schema: { type: 'object', properties: { zeitraum: { type: 'string', enum: [...ZEITRÄUME] } } },
  },
  run: async (input, ctx) => {
    void ctx;
    if (!process.env.CLOSE_API_KEY) return { fehler: 'Close ist nicht verbunden' };
    const z = (ZEITRÄUME as readonly string[]).includes(String(input.zeitraum)) ? (input.zeitraum as Zeitraum) : 'monat';
    const d = await ladeSalesControlling(z);
    return {
      zeitraum: d.zeitraum.label,
      ziel_monat: { erreicht: d.ziel.erreicht, ziel: d.ziel.ziel, prozent: d.ziel.prozent, auf_kurs_prozent: d.ziel.aufKurs, hochrechnung: d.ziel.hochrechnung, forecast: d.ziel.forecast, fehlt: d.ziel.rest, bedarf_pro_woche: d.ziel.bedarfRestProWoche },
      zahlen: { ...d.zahlen, gewonneneDeals: undefined },
      marketing: { spend: d.marketing.spend, cpl: d.marketing.cpl, kosten_pro_setting: d.marketing.kostenProSetting, roas: d.marketing.roas },
      pipeline: { offen: d.pipeline.offenAnzahl, wert: d.pipeline.offenWert, gewichtet: d.pipeline.gewichtet },
      telefonie: { anwahlen: d.details.telefonie.anwahlen, gespraeche: d.details.telefonie.gespraeche, erreichbarkeit: d.details.telefonie.erreichbarkeit, speed_to_lead_min: d.details.telefonie.speedToLeadMedianMin },
      follow_ups: { ueberfaellig: d.details.followups.aufgaben.ueberfaellig, deals_ohne_naechsten_schritt: d.details.followups.aufgaben.dealsOhneAufgabe },
      probleme: d.probleme,
    };
  },
};

/**
 * Werkzeuge je Rolle. Kunden bekommen ausschließlich Werkzeuge, die auf ihre eigene Agentur
 * (ctx.agencyId) beschränkt sind – Fragen nach anderen Kunden laufen technisch ins Leere.
 */
export function toolsFor(audience: Audience, funktion?: string | null, imKunden = false): ToolDef[] {
  if (audience === 'kunde') return [meineErgebnisse, recruitingZahlen, bewerberSuchen, deineAufgaben, empfehlungen, interesseMelden, hilfe];

  const set = new Set<ToolDef>([meineAufgaben, kundenSuchen, kalender, hilfe]);
  const f = funktion ?? '';
  if (audience === 'admin') {
    [kundenErgebnisse, innendienstArbeit, kundenChancen, teamAuslastung, salesKennzahlen].forEach((t) => set.add(t));
  } else {
    if (KUNDEN_CLOUD_BEREICHE.includes(f)) [innendienstArbeit, kundenErgebnisse].forEach((t) => set.add(t));
    if (f === 'csm') [kundenErgebnisse, kundenChancen].forEach((t) => set.add(t));
    if (SALES_BEREICHE.includes(f)) set.add(salesKennzahlen);
  }
  // Intern in einer geöffneten Kunden-Cloud: die Kunden-Werkzeuge für genau diesen Kunden dazu
  if (imKunden) [meineErgebnisse, recruitingZahlen, bewerberSuchen, deineAufgaben].forEach((t) => set.add(t));
  return [...set];
}

