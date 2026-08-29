import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';
import { createCustomer, createFirstPayment } from '@/lib/billing/mollie';

// POST — initiate first payment for mandate creation
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const body = await request.json();
  const { agency_id } = body;

  if (!agency_id) {
    return NextResponse.json({ error: 'agency_id ist erforderlich' }, { status: 400 });
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
      return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
    }

    // Check if agency already has an active mandate
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
        { error: 'Für diese Agentur existiert bereits ein gültiges SEPA-Mandat.' },
        { status: 409 }
      );
    }

    // Create or reuse Mollie customer
    let mollieCustomerId: string;

    if (existingMandate?.provider_customer_id) {
      mollieCustomerId = existingMandate.provider_customer_id;
    } else {
      mollieCustomerId = await createCustomer(admin, {
        name: agency.name,
        email: agency.email || '',
        agency_id,
      });
    }

    // Create mandate record in our DB
    const { data: mandate, error: mandateError } = await admin
      .from('mandates')
      .insert({
        agency_id,
        provider: 'mollie',
        provider_customer_id: mollieCustomerId,
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

    // Create first payment (this creates the mandate via checkout)
    const { paymentId, checkoutUrl } = await createFirstPayment(admin, {
      customerId: mollieCustomerId,
      amount: 0.01, // Minimal first payment to establish mandate
      description: `SEPA-Mandat Einrichtung — ${agency.name}`,
      redirectUrl: `${baseUrl}/admin/billing?agency_id=${agency_id}&mandate=success`,
      webhookUrl: `${baseUrl}/api/webhooks/mollie`,
      agency_id,
    });

    // Store the payment ID for tracking
    await admin
      .from('mandates')
      .update({
        provider_mandate_id: paymentId, // Will be replaced with actual mandate ID via webhook
      })
      .eq('id', mandate.id);

    return NextResponse.json({
      mandate_id: mandate.id,
      checkout_url: checkoutUrl,
      mollie_customer_id: mollieCustomerId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unbekannter Fehler bei Mandat-Erstellung' },
      { status: 500 }
    );
  }
}
