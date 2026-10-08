import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import { startPhase } from '@/lib/fulfillment/engine';
import { bausteineBereinigen, paketVorlage, bausteinLabel } from '@/lib/fulfillment/pakete';
import { neueAgenturKennungen } from '@/lib/agencies/kennungen';
import { neuerVertragToken } from '@/lib/vertrag/bestaetigen';
import type { VertragDaten } from '@/lib/vertrag/daten';

/** Kalendermonate addieren (YYYY-MM-DD); am Monatsende auf den letzten Tag des Zielmonats begrenzt. */
function plusKalendermonate(datum: string, monate: number): string {
  const [j, m, t] = datum.slice(0, 10).split('-').map(Number);
  const zielMonat = m - 1 + monate;
  const letzterTag = new Date(Date.UTC(j, zielMonat + 1, 0)).getUTCDate();
  return new Date(Date.UTC(j, zielMonat, Math.min(t, letzterTag))).toISOString().slice(0, 10);
}

interface AfterCloseBody {
  // Kunde
  firma: string;
  rechtsform?: string;
  anschrift?: string;
  ansprechpartner: string;
  telefon: string;
  email: string;
  rechnungsmail?: string;
  ust_id?: string;
  // Vertrag
  paket: string;
  /** gebuchte Leistungen: indeed / meta / innendienst */
  bausteine?: string[];
  setup_betrag?: number;
  mrr?: number;
  laufzeit_monate?: number;
  werbebudget?: number;
  start_datum?: string;
  // Leistung
  branche?: string;
  produkt?: string;
  regionen?: string[];
  gesuchte_rolle?: string;
  anzahl_starter?: number;
  // Zusagen
  zusagen_closer?: string;
  sonderfaelle?: string;
  // Ablauf
  /** einmaliger Schlüssel je Formular – erneutes Absenden legt nichts doppelt an */
  abschluss_key?: string;
  /** Willkommens-Mail mit Link zur Vertragsbestätigung an den Kunden (Standard: ja) */
  willkommensmail?: boolean;
}

export async function POST(request: Request) {
  const supabase = await createServerClient();

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: AfterCloseBody = await request.json();

  // Validate required fields
  if (!body.firma || !body.ansprechpartner || !body.telefon || !body.email || !body.paket || !body.zusagen_closer) {
    return NextResponse.json(
      { error: 'Pflichtfelder fehlen: Firma, Ansprechpartner, Telefon, E-Mail, Paket und Zusagen.' },
      { status: 400 }
    );
  }

  const bausteine = Array.isArray(body.bausteine)
    ? bausteineBereinigen(body.bausteine)
    : (paketVorlage(body.paket)?.bausteine ?? ['indeed', 'meta']);
  if (!bausteine) {
    return NextResponse.json({ error: 'Bitte mindestens eine Leistung auswählen (Indeed, Funnel + Meta oder Innendienst).' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Doppelt abgeschickt (Doppelklick, Netzwerk-Retry) → den schon angelegten Kunden zurückgeben
  const abschlussKey = typeof body.abschluss_key === 'string' && body.abschluss_key.length >= 8 ? body.abschluss_key : null;
  if (abschlussKey) {
    const { data: schon } = await admin.from('agencies').select('id, name').eq('abschluss_key', abschlussKey).maybeSingle();
    if (schon) return NextResponse.json({ agency: schon, invite_url: null, doppelt: true, hinweise: ['Dieser Abschluss wurde bereits angelegt.'] });
  }

  // Get the current user for activity logging
  const { data: { user: authUser } } = await supabase.auth.getUser();

  // --- 1. Create agency ---
  const guaranteeStart = body.start_datum || new Date().toISOString().slice(0, 10);
  const guaranteeLaufzeit = body.laufzeit_monate ?? 12;
  const guaranteeEnd = plusKalendermonate(guaranteeStart, guaranteeLaufzeit);

  const { data: agency, error: agencyError } = await admin
    .from('agencies')
    .insert({
      ...(await neueAgenturKennungen(admin, body.firma)),
      name: body.firma,
      contact_name: body.ansprechpartner,
      email: body.email,
      phone: body.telefon,
      rechtsform: body.rechtsform || null,
      anschrift: body.anschrift || null,
      rechnungsmail: body.rechnungsmail || null,
      ust_id: body.ust_id || null,
      paket: body.paket,
      bausteine,
      setup_betrag: body.setup_betrag ?? null,
      mrr: body.mrr ?? null,
      laufzeit_monate: body.laufzeit_monate ?? null,
      werbebudget: body.werbebudget ?? null,
      garantie_start: guaranteeStart,
      garantie_ende: guaranteeEnd,
      zusagen_closer: body.zusagen_closer || null,
      sonderfaelle: body.sonderfaelle || null,
      garantie_ziel_starter: body.anzahl_starter ?? null,
      abschluss_key: abschlussKey,
      onboarding_completed: false,
      // Neue Fulfillment-Strecke (Vertrag, Setup, Meta, Funnel, Umfragen …) nur für neue Kunden
      automatik: true,
    })
    .select()
    .single();

  if (agencyError?.code === '23505' && abschlussKey) {
    const { data: schon } = await admin.from('agencies').select('id, name').eq('abschluss_key', abschlussKey).maybeSingle();
    if (schon) return NextResponse.json({ agency: schon, invite_url: null, doppelt: true, hinweise: ['Dieser Abschluss wurde bereits angelegt.'] });
  }
  if (agencyError || !agency) {
    return NextResponse.json(
      { error: 'Agentur konnte nicht erstellt werden.', details: agencyError?.message },
      { status: 500 }
    );
  }

  const agencyId = agency.id as string;

  try {
    // --- 2. Create empty client_profiles scaffold ---
    await admin.from('client_profiles').insert({
      agency_id: agencyId,
      gesuchte_rolle: body.gesuchte_rolle || null,
    });

    // Onboarding-Formular mit den Infos aus dem Abschluss vorbefüllen (Kunde ergänzt nur noch)
    // – auch Grundlage für die 1-Klick-Indeed-Anzeige
    await admin.from('onboarding_submissions').insert({
      agency_id: agencyId,
      status: 'in_progress',
      company_name: body.firma,
      job_title: body.gesuchte_rolle || null,
      regions: body.regionen?.length ? body.regionen : null,
      product: body.produkt || null,
      industry: body.branche || null,
    });

    // --- 3. Create invite token ---
    const { data: invite } = await admin
      .from('invite_tokens')
      .insert({ agency_id: agencyId, email: body.email })
      .select()
      .single();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteUrl = invite ? `${baseUrl}/register/${invite.token}` : null;
    const hinweise: string[] = [];

    // --- 4a. Fulfillment v2: Kunde startet in der Phase "Zahlung".
    // "Vertrag unterschrieben" hakt erst die Vertragsbestätigung des Kunden in der Cloud ab.
    try {
      await startPhase(admin, agencyId, 'zahlung');
    } catch (err) {
      console.error('[after-close] Fulfillment-Start fehlgeschlagen:', err);
    }

    // --- 4b. Create billing plan from paket ---
    let billingPlanId: string | null = null;
    let checkoutUrl: string | null = null;

    // Look up paket definition for pricing
    const { data: paketDef } = await admin
      .from('paket_definitionen')
      .select('*')
      .eq('key', body.paket)
      .single();

    const retainerNetto = body.mrr ?? paketDef?.retainer_netto ?? 0;
    const setupNetto = body.setup_betrag ?? paketDef?.setup_netto ?? 0;
    const laufzeit = body.laufzeit_monate ?? paketDef?.laufzeit_monate ?? 12;

    if (retainerNetto > 0) {
      // Create retainer billing plan
      const { data: plan } = await admin.from('billing_plans').insert({
        agency_id: agencyId,
        typ: 'retainer',
        betrag_netto: retainerNetto,
        ust_satz: 19.00,
        rhythmus: 'monatlich',
        faelligkeitstag: 1,
        start_datum: guaranteeStart,
        ende_datum: guaranteeEnd,
        status: 'aktiv',
      }).select().single();

      if (plan) billingPlanId = plan.id;
    }

    if (setupNetto > 0) {
      // Create setup billing plan
      await admin.from('billing_plans').insert({
        agency_id: agencyId,
        typ: 'setup',
        betrag_netto: setupNetto,
        ust_satz: 19.00,
        rhythmus: 'einmalig',
        faelligkeitstag: 1,
        start_datum: guaranteeStart,
        status: 'aktiv',
      });
    }

    // --- 4c. Vertrag zur Bestätigung durch den Kunden (ersetzt Adobe Sign) ---
    // Die Setup-Rechnung schreibt die Buchhaltung danach von Hand in Lexware; die Cloud erkennt Rechnung und Zahlung selbst.
    const vertragDaten: VertragDaten = {
      firma: body.firma,
      anschrift: body.anschrift || null,
      ansprechpartner: body.ansprechpartner,
      email: body.email,
      paket: paketVorlage(body.paket)?.name ?? (paketDef?.name as string | undefined) ?? body.paket,
      leistungen: bausteine.map(bausteinLabel),
      setup_netto: Number(setupNetto) || 0,
      monat_netto: Number(retainerNetto) || 0,
      laufzeit_monate: laufzeit,
      start_datum: guaranteeStart,
      garantie_ziel_starter: body.anzahl_starter ?? null,
      ust_satz: 19,
    };
    const vertragToken = neuerVertragToken();
    const { error: vertragErr } = await admin
      .from('vertraege')
      .insert({ agency_id: agencyId, token: vertragToken, daten: vertragDaten });
    if (vertragErr) throw new Error(`Vertrag konnte nicht angelegt werden: ${vertragErr.message}`);
    const vertragUrl = `${baseUrl}/vertrag/${vertragToken}`;

    // --- 4d. Willkommens-Mail mit Link zur Vertragsbestätigung (noch ohne Rechnung) ---
    let willkommenGesendet = false;
    if (body.willkommensmail !== false && body.email) {
      try {
        const { sendVertragLink } = await import('@/lib/email/resend');
        await sendVertragLink(body.email, body.ansprechpartner, body.firma, vertragUrl);
        willkommenGesendet = true;
      } catch (err) {
        hinweise.push(`Willkommens-Mail konnte nicht verschickt werden (${err instanceof Error ? err.message : 'unbekannt'}). Bitte den Vertragslink selbst schicken.`);
      }
    } else {
      hinweise.push('Willkommens-Mail wurde nicht verschickt – bitte den Vertragslink selbst an den Kunden schicken.');
    }

    // --- 4e. Create Stripe customer + checkout link ---
    // Aktuell zahlen Kunden per Überweisung (Lexware/Qonto) – Stripe nur bei ausdrücklicher Aktivierung
    if (process.env.STRIPE_CHECKOUT_AKTIV === 'true') try {
      const { createCustomer, createCheckoutSession } = await import('@/lib/billing/stripe');
      const stripeCustomerId = await createCustomer(admin, {
        name: body.firma,
        email: body.rechnungsmail || body.email,
        agency_id: agencyId,
      });

      if (stripeCustomerId) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
        const session = await createCheckoutSession(admin, {
          customerId: stripeCustomerId,
          agency_id: agencyId,
          successUrl: `${baseUrl}/dashboard?zahlung=success`,
          cancelUrl: `${baseUrl}/dashboard?zahlung=abgebrochen`,
        });

        checkoutUrl = session.checkoutUrl;

        await admin.from('mandates').insert({
          agency_id: agencyId,
          provider: 'stripe',
          provider_customer_id: stripeCustomerId,
          status: 'angefragt',
          checkout_url: checkoutUrl,
        });
      }
    } catch { /* Stripe optional — don't block */ }

    // --- 6. Notification ---
    await createNotificationForInternals(admin, {
      title: `Neuer Kunde: ${body.firma}`,
      body: `${body.ansprechpartner} — Paket: ${body.paket}`,
      type: 'system',
      entity_type: 'agency',
      entity_id: agencyId,
    });

    // --- 7. Activity log ---
    await logActivity(admin, {
      agency_id: agencyId,
      user_id: authUser?.id ?? null,
      action: `Neuer Kunde angelegt: ${body.firma} (${body.paket})`,
      action_type: 'after_close',
      metadata: {
        paket: body.paket,
        bausteine,
        mrr: body.mrr,
        willkommensmail: willkommenGesendet,
      },
    });

    return NextResponse.json({
      agency,
      invite_url: inviteUrl,
      billing_plan_id: billingPlanId,
      checkout_url: checkoutUrl,
      vertrag_url: vertragUrl,
      willkommensmail: willkommenGesendet,
      hinweise,
    });
  } catch (err: unknown) {
    // Etwas nach dem Anlegen ist schiefgelaufen → als Blocker am Kunden sichtbar machen
    // (früher agencies.status = 'setup_fehler' – die Spalte gibt es seit Fulfillment v2 nicht mehr)
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    await admin
      .from('agencies')
      .update({ pausiert_grund: `Setup-Fehler: ${message}`.slice(0, 300) })
      .eq('id', agencyId);

    await logActivity(admin, {
      agency_id: agencyId,
      user_id: authUser?.id ?? null,
      action: `Setup-Fehler für ${body.firma}: ${message}`,
      action_type: 'setup_error',
      metadata: { error: message },
    });

    return NextResponse.json(
      { error: 'Projekt-Setup fehlgeschlagen. Agentur wurde erstellt, aber Status ist "setup_fehler".', agency_id: agencyId, details: message },
      { status: 500 }
    );
  }
}
