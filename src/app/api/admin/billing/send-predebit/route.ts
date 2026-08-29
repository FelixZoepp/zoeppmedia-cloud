import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const { billing_run_id } = await request.json();
  if (!billing_run_id) {
    return NextResponse.json({ error: 'billing_run_id erforderlich' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: run } = await admin
    .from('billing_runs')
    .select('*, agencies:agency_id(name, contact_name, email)')
    .eq('id', billing_run_id)
    .single();

  if (!run) {
    return NextResponse.json({ error: 'Billing Run nicht gefunden' }, { status: 404 });
  }

  const agency = run.agencies as unknown as { name: string; contact_name: string; email: string } | null;
  if (!agency?.email) {
    return NextResponse.json({ error: 'Keine E-Mail für Kunden' }, { status: 400 });
  }

  // Get mandate info
  const { data: mandate } = await admin
    .from('mandates')
    .select('provider_mandate_id')
    .eq('agency_id', run.agency_id)
    .eq('status', 'gueltig')
    .single();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const datumFormatiert = tomorrow.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const resend = new Resend(process.env.RESEND_API_KEY || '');
  const { error: mailError } = await resend.emails.send({
    from: 'Zoepp Media Cloud <noreply@zoepp-gruppe.de>',
    to: agency.email,
    subject: `Vorabankündigung: SEPA-Einzug am ${datumFormatiert} — ${run.lex_invoice_number || run.periode}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #DC2626; padding: 20px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Zoepp Media Cloud</h1>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #111827; font-size: 16px;">Hallo ${agency.contact_name || agency.name},</p>
          <p style="color: #4b5563;">hiermit informieren wir dich, dass wir den folgenden Betrag per SEPA-Lastschrift einziehen werden:</p>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="color: #6b7280; padding: 6px 0;">Rechnungsnummer</td><td style="color: #111827; font-weight: 600; text-align: right;">${run.lex_invoice_number || run.periode}</td></tr>
              <tr><td style="color: #6b7280; padding: 6px 0;">Betrag (brutto)</td><td style="color: #111827; font-weight: 600; text-align: right;">${Number(run.betrag_brutto).toFixed(2)} €</td></tr>
              <tr><td style="color: #6b7280; padding: 6px 0;">Einzugsdatum</td><td style="color: #111827; font-weight: 600; text-align: right;">${datumFormatiert}</td></tr>
              <tr><td style="color: #6b7280; padding: 6px 0;">Gläubiger</td><td style="color: #111827; text-align: right;">Zoepp Media UG</td></tr>
            </table>
          </div>
          <p style="color: #4b5563; font-size: 14px;">Bitte stelle sicher, dass dein Konto zum Einzugsdatum ausreichend gedeckt ist.</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Diese Vorabankündigung erfolgt gemäß den Regelungen des SEPA-Lastschriftverfahrens.</p>
          <p style="color: #4b5563; font-size: 14px; margin-top: 16px;">Viele Grüße<br>Felix Zoepp</p>
        </div>
      </div>
    `,
  });

  if (mailError) {
    return NextResponse.json({ error: mailError.message }, { status: 500 });
  }

  // Update billing run status
  await admin
    .from('billing_runs')
    .update({ status: 'vorab_benachrichtigt' })
    .eq('id', billing_run_id);

  return NextResponse.json({ ok: true, gesendet_an: agency.email, einzugsdatum: datumFormatiert });
}
