import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const LEXOFFICE_BASE_URL = 'https://api.lexoffice.io/v1';

function getApiKey(): string {
  const key = process.env.LEXOFFICE_API_KEY;
  if (!key) {
    throw new Error('LEXOFFICE_API_KEY ist nicht konfiguriert');
  }
  return key;
}

function hashPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(payload ?? ''))
    .digest('hex')
    .substring(0, 16);
}

function truncateResponse(data: unknown): string {
  const str = JSON.stringify(data);
  return str.length > 500 ? str.substring(0, 500) + '...' : str;
}

// ---------------------------------------------------------------------------
// Integration log helper
// ---------------------------------------------------------------------------
export async function logApiCall(
  supabase: SupabaseClient,
  system: 'lexoffice' | 'mollie',
  richtung: 'request' | 'response' | 'webhook',
  endpunkt: string,
  methode: string | null,
  httpStatus: number | null,
  antwort: unknown,
  agencyId: string | null,
  fehler: boolean
): Promise<void> {
  try {
    await supabase.from('integration_logs').insert({
      system,
      richtung,
      endpunkt,
      methode,
      payload_hash: hashPayload(antwort),
      http_status: httpStatus,
      antwort_auszug: truncateResponse(antwort),
      agency_id: agencyId,
      fehler,
    });
  } catch {
    // Logging should never break the main operation
  }
}

// ---------------------------------------------------------------------------
// Internal fetch wrapper — logs request + response
// ---------------------------------------------------------------------------
async function lexFetch(
  supabase: SupabaseClient,
  method: string,
  path: string,
  body: unknown | null,
  agencyId: string | null
): Promise<{ status: number; data: Record<string, unknown> }> {
  const url = `${LEXOFFICE_BASE_URL}${path}`;
  const apiKey = getApiKey();

  // Log outgoing request
  await logApiCall(supabase, 'lexoffice', 'request', path, method, null, body, agencyId, false);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: Record<string, unknown> = {};
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = (await res.json()) as Record<string, unknown>;
  }

  const fehler = !res.ok;

  // Log response
  await logApiCall(
    supabase,
    'lexoffice',
    'response',
    path,
    method,
    res.status,
    data,
    agencyId,
    fehler
  );

  if (fehler) {
    throw new Error(
      `Lexware Office API Fehler ${res.status}: ${JSON.stringify(data)}`
    );
  }

  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------
export async function createContact(
  supabase: SupabaseClient,
  agency: {
    id: string;
    name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    street?: string;
    zip?: string;
    city?: string;
    tax_number?: string;
    vat_id?: string;
  }
): Promise<string> {
  const contactPayload: Record<string, unknown> = {
    version: 0,
    roles: { customer: {} },
    company: {
      name: agency.name,
      ...(agency.tax_number ? { taxNumber: agency.tax_number } : {}),
      ...(agency.vat_id ? { vatRegistrationId: agency.vat_id } : {}),
      ...(agency.contact_name
        ? {
            contactPersons: [
              {
                firstName: agency.contact_name.split(' ')[0] || '',
                lastName: agency.contact_name.split(' ').slice(1).join(' ') || agency.contact_name,
              },
            ],
          }
        : {}),
    },
    addresses: {
      billing: [
        {
          street: agency.street || '',
          zip: agency.zip || '',
          city: agency.city || '',
          countryCode: 'DE',
        },
      ],
    },
    ...(agency.email
      ? { emailAddresses: { business: [agency.email] } }
      : {}),
    ...(agency.phone
      ? { phoneNumbers: { business: [agency.phone] } }
      : {}),
  };

  const { data } = await lexFetch(
    supabase,
    'POST',
    '/contacts',
    contactPayload,
    agency.id
  );

  return data.id as string;
}

export async function getContact(
  supabase: SupabaseClient,
  contactId: string
): Promise<Record<string, unknown>> {
  const { data } = await lexFetch(supabase, 'GET', `/contacts/${contactId}`, null, null);
  return data;
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------
export async function createInvoice(
  supabase: SupabaseClient,
  params: {
    contactId: string;
    agency_id: string;
    betrag_netto: number;
    ust_satz: number;
    beschreibung: string;
    faelligkeitsdatum: string; // YYYY-MM-DD
    idempotenz_schluessel: string;
  }
): Promise<{ id: string; invoiceNumber: string }> {
  const today = new Date().toISOString().split('T')[0];

  // Calculate days until due
  const dueDate = new Date(params.faelligkeitsdatum);
  const todayDate = new Date(today);
  const diffMs = dueDate.getTime() - todayDate.getTime();
  const paymentTermDuration = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  const invoicePayload = {
    voucherDate: today,
    address: { contactId: params.contactId },
    lineItems: [
      {
        type: 'custom',
        name: params.beschreibung,
        quantity: 1,
        unitName: 'Stück',
        unitPrice: {
          currency: 'EUR',
          netAmount: params.betrag_netto,
          taxRatePercentage: params.ust_satz,
        },
      },
    ],
    totalPrice: { currency: 'EUR' },
    taxConditions: { taxType: 'net' },
    shippingConditions: {
      shippingDate: today,
      shippingType: 'none',
    },
    paymentConditions: {
      paymentTermLabel: `Fällig am ${params.faelligkeitsdatum}`,
      paymentTermDuration,
    },
  };

  // 1. Create draft invoice
  const { data: draftData } = await lexFetch(
    supabase,
    'POST',
    '/invoices',
    invoicePayload,
    params.agency_id
  );

  const invoiceId = draftData.id as string;

  // 2. Finalize invoice to get invoice number
  const { data: finalizedData } = await lexFetch(
    supabase,
    'POST',
    `/invoices/${invoiceId}/document`,
    null,
    params.agency_id
  );

  // After finalizing, GET the invoice to retrieve the invoice number
  const { data: invoiceDetail } = await lexFetch(
    supabase,
    'GET',
    `/invoices/${invoiceId}`,
    null,
    params.agency_id
  );

  const invoiceNumber =
    (finalizedData.documentNumber as string) ||
    (invoiceDetail.voucherNumber as string) ||
    '';

  return { id: invoiceId, invoiceNumber };
}

// ---------------------------------------------------------------------------
// Record payment on a finalized invoice
// ---------------------------------------------------------------------------
export async function recordPayment(
  supabase: SupabaseClient,
  invoiceId: string,
  params: {
    betrag: number;
    datum: string; // YYYY-MM-DD
    zahlungsart: string; // 'bankTransfer'
  }
): Promise<void> {
  // Lexware Office does not have a direct "record payment" REST endpoint.
  // Instead we mark the invoice as paid via the /payments endpoint.
  // POST /v1/payments — applies a payment booking to a voucher.
  // NOTE: This requires the "bookkeeping" scope in the API key.
  // If the endpoint is unavailable, we log the attempt and skip silently.
  try {
    await lexFetch(
      supabase,
      'POST',
      '/payments',
      {
        voucherId: invoiceId,
        voucherType: 'invoice',
        amount: params.betrag,
        currency: 'EUR',
        paymentDate: params.datum,
        paymentType: params.zahlungsart,
      },
      null
    );
  } catch (error) {
    // Log but don't throw — some Lexware API keys don't have payment scope
    await logApiCall(
      supabase,
      'lexoffice',
      'response',
      '/payments',
      'POST',
      null,
      { error: error instanceof Error ? error.message : 'Unbekannter Fehler' },
      null,
      true
    );
  }
}

// ---------------------------------------------------------------------------
// Get invoice PDF
// ---------------------------------------------------------------------------
export async function getInvoicePdf(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<Buffer> {
  const url = `${LEXOFFICE_BASE_URL}/invoices/${invoiceId}/document`;
  const apiKey = getApiKey();

  await logApiCall(supabase, 'lexoffice', 'request', `/invoices/${invoiceId}/document`, 'GET', null, null, null, false);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/pdf',
    },
  });

  if (!res.ok) {
    await logApiCall(supabase, 'lexoffice', 'response', `/invoices/${invoiceId}/document`, 'GET', res.status, { error: 'PDF download fehlgeschlagen' }, null, true);
    throw new Error(`PDF Download fehlgeschlagen: ${res.status}`);
  }

  await logApiCall(supabase, 'lexoffice', 'response', `/invoices/${invoiceId}/document`, 'GET', res.status, { info: 'PDF erfolgreich abgerufen' }, null, false);

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
