import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';
import { createCustomer, createCheckoutSession } from '@/lib/billing/stripe';

// POST — generates a new Stripe Checkout Session for SEPA mandate setup
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agency_id } = await params;
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const admin = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // Fetch agency
    const { data: agency } = await admin
      .from('agencies')
      .select('*')
      .eq('id', agency_id)
      .single();

    if (!agency) {
      return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
    }

    // Check for existing active mandate
    const { data: existingMandate } = await admin
      .from('mandates')
      .select('*')
      .eq('agency_id', agency_id)
      .in('status', ['angefragt', 'gueltig'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingMandate?.status === 'gueltig') {
      return NextResponse.json(
        { error: 'Es existiert bereits ein gueltiges SEPA-Mandat.' },
        { status: 409 }
      );
    }

    // Create or reuse Stripe customer
    let stripeCustomerId: string;

    if (existingMandate?.provider_customer_id) {
      stripeCustomerId = existingMandate.provider_customer_id;
    } else {
      stripeCustomerId = await createCustomer(admin, {
        name: agency.name,
        email: agency.email || '',
        agency_id,
      });
    }

    // Create mandate record
    const { data: mandate, error: mandateError } = await admin
      .from('mandates')
      .insert({
        agency_id,
        provider: 'stripe',
        provider_customer_id: stripeCustomerId,
        status: 'angefragt',
      })
      .select()
      .single();

    if (mandateError || !mandate) {
      return NextResponse.json(
        { error: `Mandat konnte nicht erstellt werden: ${mandateError?.message}` },
        { status: 500 }
      );
    }

    // Create Checkout Session
    const { sessionId, checkoutUrl } = await createCheckoutSession(admin, {
      customerId: stripeCustomerId,
      agency_id,
      successUrl: `${baseUrl}/admin/finanzen/kunden/${agency_id}?mandate=success`,
      cancelUrl: `${baseUrl}/admin/finanzen/kunden/${agency_id}?mandate=cancelled`,
    });

    // Store session ID
    await admin
      .from('mandates')
      .update({ provider_mandate_id: sessionId })
      .eq('id', mandate.id);

    return NextResponse.json({
      mandate_id: mandate.id,
      checkout_url: checkoutUrl,
      stripe_customer_id: stripeCustomerId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unbekannter Fehler bei Checkout-Link-Erstellung' },
      { status: 500 }
    );
  }
}
