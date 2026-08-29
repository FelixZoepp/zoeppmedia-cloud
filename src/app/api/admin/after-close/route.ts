import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import { createProjectFromClose } from '@/lib/fulfillment/create-project';

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

  const admin = createAdminClient();

  // Get the current user for activity logging
  const { data: { user: authUser } } = await supabase.auth.getUser();

  // --- 1. Create agency ---
  const guaranteeStart = body.start_datum || new Date().toISOString().slice(0, 10);
  const guaranteeLaufzeit = body.laufzeit_monate ?? 12;
  const guaranteeEnd = new Date(
    new Date(guaranteeStart).getTime() + guaranteeLaufzeit * 30 * 86400000
  ).toISOString().slice(0, 10);

  const { data: agency, error: agencyError } = await admin
    .from('agencies')
    .insert({
      name: body.firma,
      contact_name: body.ansprechpartner,
      email: body.email,
      phone: body.telefon,
      rechtsform: body.rechtsform || null,
      anschrift: body.anschrift || null,
      rechnungsmail: body.rechnungsmail || null,
      ust_id: body.ust_id || null,
      paket: body.paket,
      setup_betrag: body.setup_betrag ?? null,
      mrr: body.mrr ?? null,
      laufzeit_monate: body.laufzeit_monate ?? null,
      werbebudget: body.werbebudget ?? null,
      garantie_start: guaranteeStart,
      garantie_ende: guaranteeEnd,
      zusagen_closer: body.zusagen_closer || null,
      sonderfaelle: body.sonderfaelle || null,
      status: 'onboarding',
      onboarding_completed: false,
    })
    .select()
    .single();

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

    // --- 3. Create invite token ---
    const { data: invite } = await admin
      .from('invite_tokens')
      .insert({ agency_id: agencyId, email: body.email })
      .select()
      .single();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteUrl = invite ? `${baseUrl}/register/${invite.token}` : null;

    // --- 4 & 5. Create access_items and project_tasks ---
    const produkt = body.produkt || body.paket;
    const { tasks_created, access_items_created } = await createProjectFromClose(
      admin,
      agencyId,
      produkt
    );

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

    // --- 4c. Create Lexware contact ---
    let lexContactId: string | null = null;
    try {
      const { createContact } = await import('@/lib/billing/lexoffice');
      lexContactId = await createContact(admin, agency);
      if (lexContactId) {
        await admin.from('agencies').update({ lex_contact_id: lexContactId }).eq('id', agencyId);
      }
    } catch { /* Lexware optional — don't block */ }

    // --- 4d. Create Stripe customer + checkout link ---
    try {
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
        mrr: body.mrr,
        tasks_created,
        access_items_created,
      },
    });

    return NextResponse.json({
      agency,
      tasks_created,
      access_items_created,
      invite_url: inviteUrl,
      billing_plan_id: billingPlanId,
      lex_contact_id: lexContactId,
      checkout_url: checkoutUrl,
    });
  } catch (err: unknown) {
    // Something after agency creation failed — mark as setup_fehler
    await admin
      .from('agencies')
      .update({ status: 'setup_fehler' })
      .eq('id', agencyId);

    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';

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
