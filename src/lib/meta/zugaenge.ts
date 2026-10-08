/**
 * Meta-Zugänge per Graph-API prüfen (nur lesend, mit dem Systemnutzer-Token).
 *
 * Für jeden Meta-Schritt im Onboarding (Seite, Instagram, Werbekonto, Pixel, Domain, Zahlungsmethode)
 * wird geprüft, ob der Zugang wirklich da ist. Ergebnis:
 *  - ok         → Schritt wird automatisch abgehakt
 *  - fehlt      → Hinweis „Was fehlt noch“ landet am Schritt (Kunde sieht ihn unter „Deine Aufgaben“)
 *  - unbekannt  → ließ sich nicht automatisch prüfen, bleibt bei der Prüfung durch das Team
 *
 * Gefundene IDs (Seite, Instagram, Pixel) werden am Kunden gespeichert – die Kampagnen-Anlage braucht sie.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MetaApiError, META_ACT, metaRequest } from './api';
import { setStepStatus } from '@/lib/fulfillment/engine';

export type ZugangStatus = 'ok' | 'fehlt' | 'unbekannt';

export interface ZugangErgebnis {
  step_key: string;
  label: string;
  status: ZugangStatus;
  hinweis: string;
}

export interface ZugangPruefung {
  geprueft_am: string;
  alle_ok: boolean;
  ergebnisse: ZugangErgebnis[];
}

/** Meta-Schritte aus dem Ablauf, die sich per API prüfen lassen */
export const META_ZUGANG_SCHRITTE = [
  'o_meta_werbekonto',
  'o_meta_zahlung',
  'o_meta_seite',
  'o_meta_instagram',
  'o_meta_pixel',
  'o_meta_domain',
] as const;

const fehlerText = (err: unknown) => (err instanceof MetaApiError ? err.meldung : err instanceof Error ? err.message : 'Fehler');

interface AgencyMeta {
  id: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_instagram_id: string | null;
  meta_pixel_id: string | null;
}

/** Domain der Funnel-/Bewerbungsseite (für die Domain-Prüfung) */
async function funnelDomain(svc: SupabaseClient, agencyId: string): Promise<string | null> {
  const { data } = await svc.from('perspective_funnels').select('url, status').eq('agency_id', agencyId).order('updated_at', { ascending: false }).limit(5);
  const urls = ((data ?? []) as Array<{ url: string | null; status: string }>).filter((f) => f.url);
  const url = (urls.find((f) => f.status === 'published') ?? urls[0])?.url;
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Prüft alle Meta-Zugänge eines Kunden. Ändert nichts bei Meta.
 * Speichert gefundene Asset-IDs und das Ergebnis am Kunden.
 */
export async function pruefeMetaZugaenge(svc: SupabaseClient, agencyId: string, now: Date = new Date()): Promise<ZugangPruefung> {
  const { data: a } = await svc
    .from('agencies')
    .select('id, meta_ad_account_id, meta_page_id, meta_instagram_id, meta_pixel_id')
    .eq('id', agencyId)
    .maybeSingle();
  const agency = a as AgencyMeta | null;
  if (!agency) throw new Error('Kunde nicht gefunden');

  const ergebnisse: ZugangErgebnis[] = [];
  const add = (step_key: string, label: string, status: ZugangStatus, hinweis: string) => ergebnisse.push({ step_key, label, status, hinweis });
  const updates: Partial<AgencyMeta> = {};

  const act = agency.meta_ad_account_id;
  let businessId: string | null = null;

  // 1. Werbekonto + Zahlungsmethode
  if (!act) {
    add('o_meta_werbekonto', 'Werbekonto', 'fehlt', 'Werbekonto-ID ist noch nicht eingetragen – erst wenn das Werbekonto mit uns geteilt ist, kann das Team die ID eintragen.');
    add('o_meta_zahlung', 'Zahlungsmethode', 'unbekannt', 'Prüfbar, sobald das Werbekonto verbunden ist.');
  } else {
    try {
      const konto = await metaRequest<{
        account_status?: number;
        disable_reason?: number;
        funding_source?: string | null;
        funding_source_details?: { id?: string; display_string?: string } | null;
        business?: { id: string } | null;
      }>(META_ACT(act), { params: { fields: 'name,account_status,disable_reason,funding_source,funding_source_details,business' } });
      businessId = konto.business?.id ?? null;
      if (konto.account_status === 1) add('o_meta_werbekonto', 'Werbekonto', 'ok', 'Werbekonto ist mit uns geteilt und aktiv.');
      else if (konto.account_status === 2) add('o_meta_werbekonto', 'Werbekonto', 'fehlt', 'Das Werbekonto ist bei Meta deaktiviert. Bitte im Werbekonto unter „Kontoqualität“ nachsehen und ggf. Überprüfung anfordern.');
      else add('o_meta_werbekonto', 'Werbekonto', 'fehlt', `Das Werbekonto ist nicht aktiv (Meta-Status ${konto.account_status ?? 'unbekannt'}) – meist offene Zahlung oder Überprüfung.`);

      if (konto.funding_source || konto.funding_source_details?.id) add('o_meta_zahlung', 'Zahlungsmethode', 'ok', `Zahlungsmethode hinterlegt${konto.funding_source_details?.display_string ? ` (${konto.funding_source_details.display_string})` : ''}.`);
      else add('o_meta_zahlung', 'Zahlungsmethode', 'fehlt', 'Im Werbekonto ist noch keine Zahlungsmethode hinterlegt: Werbekonto öffnen → Abrechnung & Zahlungen → Zahlungsmethode hinzufügen.');
    } catch (err) {
      add('o_meta_werbekonto', 'Werbekonto', 'fehlt', `Wir kommen nicht ins Werbekonto (${fehlerText(err)}). Bitte prüfen, ob das Werbekonto mit voller Kontrolle an uns als Partner geteilt ist.`);
      add('o_meta_zahlung', 'Zahlungsmethode', 'unbekannt', 'Prüfbar, sobald wir Zugriff aufs Werbekonto haben.');
    }
  }

  // 2. Facebook-Seite (gespeicherte ID oder über das Werbekonto finden)
  let pageId = agency.meta_page_id;
  if (!pageId && act) {
    try {
      const seiten = await metaRequest<{ data?: Array<{ id: string }> }>(`${META_ACT(act)}/promote_pages`, { params: { fields: 'id,name', limit: '5' } });
      pageId = seiten.data?.[0]?.id ?? null;
      if (pageId) updates.meta_page_id = pageId;
    } catch {
      /* unten als „fehlt“ gemeldet */
    }
  }
  let igAusSeite: string | null = null;
  if (!pageId) {
    add('o_meta_seite', 'Facebook-Seite', 'fehlt', 'Wir sehen noch keine Facebook-Seite. Bitte die Seite als Partner an uns freigeben (volle Kontrolle).');
  } else {
    try {
      const seite = await metaRequest<{ name?: string; instagram_business_account?: { id: string } | null }>(`/${pageId}`, {
        params: { fields: 'name,instagram_business_account' },
      });
      igAusSeite = seite.instagram_business_account?.id ?? null;
      add('o_meta_seite', 'Facebook-Seite', 'ok', `Zugriff auf die Seite „${seite.name ?? pageId}“ ist da.`);
    } catch (err) {
      add('o_meta_seite', 'Facebook-Seite', 'fehlt', `Kein Zugriff auf die Facebook-Seite (${fehlerText(err)}). Bitte die Seite als Partner an uns freigeben.`);
    }
  }

  // 3. Instagram (über die Seite oder das Werbekonto)
  let igId = agency.meta_instagram_id ?? igAusSeite;
  if (!igId && act) {
    try {
      const ig = await metaRequest<{ data?: Array<{ id: string }> }>(`${META_ACT(act)}/instagram_accounts`, { params: { fields: 'id,username', limit: '5' } });
      igId = ig.data?.[0]?.id ?? null;
    } catch {
      /* unten als „fehlt“ gemeldet */
    }
  }
  if (igId) {
    if (igId !== agency.meta_instagram_id) updates.meta_instagram_id = igId;
    add('o_meta_instagram', 'Instagram', 'ok', 'Instagram-Konto ist verbunden.');
  } else {
    add('o_meta_instagram', 'Instagram', 'fehlt', 'Wir sehen noch kein Instagram-Konto. Bitte das Instagram-Konto im Business-Portfolio beanspruchen und als Partner an uns freigeben.');
  }

  // 4. Pixel / Datensatz
  if (!act) {
    add('o_meta_pixel', 'Pixel', 'unbekannt', 'Prüfbar, sobald das Werbekonto verbunden ist.');
  } else {
    try {
      const pixel = await metaRequest<{ data?: Array<{ id: string; name?: string }> }>(`${META_ACT(act)}/adspixels`, { params: { fields: 'id,name,last_fired_time', limit: '10' } });
      const liste = pixel.data ?? [];
      const treffer = liste.find((p) => p.id === agency.meta_pixel_id) ?? liste[0];
      if (treffer) {
        if (treffer.id !== agency.meta_pixel_id) updates.meta_pixel_id = treffer.id;
        add('o_meta_pixel', 'Pixel', 'ok', `Pixel „${treffer.name ?? treffer.id}“ ist mit dem Werbekonto verbunden.`);
      } else {
        add('o_meta_pixel', 'Pixel', 'fehlt', 'Am Werbekonto hängt noch kein Pixel. Bitte beim Pixel „Assets zuweisen“ → dein Werbekonto auswählen → Hinzufügen.');
      }
    } catch (err) {
      add('o_meta_pixel', 'Pixel', 'fehlt', `Pixel nicht lesbar (${fehlerText(err)}). Bitte den Pixel als Partner an uns freigeben.`);
    }
  }

  // 5. Domain – nur prüfbar mit Business-ID und bekannter Funnel-Domain
  const domain = await funnelDomain(svc, agencyId);
  if (!businessId || !domain) {
    add('o_meta_domain', 'Domain', 'unbekannt', domain ? 'Business-Portfolio nicht lesbar – das Team prüft die Domain von Hand.' : 'Noch keine Funnel-Domain hinterlegt – das Team prüft die Domain von Hand.');
  } else {
    try {
      const domains = await metaRequest<{ data?: Array<{ domain_name?: string; is_verified?: boolean; verification_status?: string }> }>(
        `/${businessId}/owned_domains`,
        { params: { fields: 'domain_name,is_verified,verification_status', limit: '50' } },
      );
      const d = (domains.data ?? []).find((x) => (x.domain_name ?? '').replace(/^www\./, '') === domain);
      const verifiziert = !!d && (d.is_verified === true || /verified/i.test(d.verification_status ?? ''));
      if (verifiziert) add('o_meta_domain', 'Domain', 'ok', `Domain ${domain} ist bei Meta verifiziert.`);
      else if (d) add('o_meta_domain', 'Domain', 'fehlt', `Domain ${domain} ist angelegt, aber noch nicht verifiziert. Bitte den TXT-Eintrag beim Domain-Anbieter setzen und „Domain verifizieren“ klicken.`);
      else add('o_meta_domain', 'Domain', 'fehlt', `Domain ${domain} ist im Business-Portfolio noch nicht angelegt: Einstellungen → Brand Safety → Domains → Hinzufügen.`);
    } catch {
      add('o_meta_domain', 'Domain', 'unbekannt', 'Domain-Liste nicht lesbar – das Team prüft die Domain von Hand.');
    }
  }

  const pruefung: ZugangPruefung = {
    geprueft_am: now.toISOString(),
    alle_ok: ergebnisse.every((e) => e.status === 'ok'),
    ergebnisse,
  };
  await svc
    .from('agencies')
    .update({ ...updates, meta_zugang_pruefung: pruefung, meta_zugang_geprueft_am: pruefung.geprueft_am })
    .eq('id', agencyId);
  return pruefung;
}

/**
 * Ergebnis in den Ablauf übernehmen: ok → Schritt abhaken, fehlt → Hinweis am Schritt.
 * „unbekannt“ lässt den Schritt unverändert (Prüfung durch das Team).
 */
export async function uebernehmeZugangPruefung(
  svc: SupabaseClient,
  agencyId: string,
  pruefung: ZugangPruefung,
  opts: { userId?: string | null } = {},
): Promise<{ abgehakt: string[] }> {
  const keys = pruefung.ergebnisse.map((e) => e.step_key);
  const { data } = await svc
    .from('client_steps')
    .select('id, step_key, status, kommentar')
    .eq('agency_id', agencyId)
    .in('step_key', keys)
    .not('status', 'in', '(erledigt,nicht_noetig)');
  const offen = (data ?? []) as Array<{ id: string; step_key: string; status: string; kommentar: string | null }>;
  const abgehakt: string[] = [];
  for (const row of offen) {
    const e = pruefung.ergebnisse.find((x) => x.step_key === row.step_key);
    if (!e) continue;
    if (e.status === 'ok') {
      await setStepStatus(svc, row.id, 'erledigt', { userId: opts.userId ?? null, kommentar: `Per Meta-API geprüft: ${e.hinweis}` });
      abgehakt.push(row.step_key);
    } else if (e.status === 'fehlt') {
      const kommentar = `Automatische Prüfung: ${e.hinweis}`;
      if (row.kommentar !== kommentar) {
        await svc.from('client_steps').update({ kommentar, updated_at: new Date().toISOString() }).eq('id', row.id);
      }
    }
  }
  return { abgehakt };
}

/** Prüfen + übernehmen in einem Schritt (Knopf im Ablauf, periodischer Lauf) */
export async function pruefeUndUebernehme(svc: SupabaseClient, agencyId: string, opts: { userId?: string | null } = {}) {
  const pruefung = await pruefeMetaZugaenge(svc, agencyId);
  const { abgehakt } = await uebernehmeZugangPruefung(svc, agencyId, pruefung, opts);
  return { ...pruefung, abgehakt };
}

/**
 * Periodischer Lauf: Kunden im Onboarding mit offenen Meta-Schritten prüfen,
 * höchstens einmal je `abstandMinuten` je Kunde. Fehler einzelner Kunden stoppen den Lauf nicht.
 */
export async function metaZugaengeLauf(
  svc: SupabaseClient,
  opts: { now?: Date; abstandMinuten?: number; maxKunden?: number } = {},
): Promise<{ geprueft: number; abgehakt: number; fehler: number }> {
  if (!process.env.META_SYSTEM_USER_TOKEN) return { geprueft: 0, abgehakt: 0, fehler: 0 };
  const now = opts.now ?? new Date();
  const grenze = new Date(now.getTime() - (opts.abstandMinuten ?? 60) * 60_000).toISOString();

  const { data: steps } = await svc
    .from('client_steps')
    .select('agency_id')
    .in('step_key', [...META_ZUGANG_SCHRITTE])
    .not('status', 'in', '(erledigt,nicht_noetig)');
  const ids = [...new Set(((steps ?? []) as Array<{ agency_id: string }>).map((s) => s.agency_id))];
  if (!ids.length) return { geprueft: 0, abgehakt: 0, fehler: 0 };

  // Nur Automatik-Kunden (neue Fulfillment-Strecke); per Knopf geht es bei jedem Kunden
  const { data: ag } = await svc.from('agencies').select('id, meta_zugang_geprueft_am').in('id', ids).eq('automatik', true);
  const faellig = ((ag ?? []) as Array<{ id: string; meta_zugang_geprueft_am: string | null }>)
    .filter((x) => !x.meta_zugang_geprueft_am || x.meta_zugang_geprueft_am < grenze)
    .slice(0, opts.maxKunden ?? 10);

  let geprueft = 0;
  let abgehakt = 0;
  let fehler = 0;
  for (const k of faellig) {
    try {
      const r = await pruefeUndUebernehme(svc, k.id);
      geprueft++;
      abgehakt += r.abgehakt.length;
    } catch (err) {
      fehler++;
      console.error('[meta-zugaenge] Prüfung fehlgeschlagen', k.id, err);
    }
  }
  return { geprueft, abgehakt, fehler };
}
