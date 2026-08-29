import { SupabaseClient } from '@supabase/supabase-js';
import { logApiCall } from './lexoffice';

const MOLLIE_BASE_URL = 'https://api.mollie.com/v2';

function getApiKey(): string {
  const key = process.env.MOLLIE_API_KEY;
  if (!key) {
    throw new Error('MOLLIE_API_KEY ist nicht konfiguriert. Bitte zuerst in den Umgebungsvariablen hinterlegen.');
  }
  return key;
}

/**
 * Format a number as Mollie amount string (always 2 decimals).
 * Mollie requires amounts as `{ "currency": "EUR", "value": "10.00" }`.
 */
function formatAmount(amount: number): { currency: string; value: string } {
  return {
    currency: 'EUR',
    value: amount.toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// Internal fetch wrapper — logs request + response to integration_logs
// ---------------------------------------------------------------------------
async function mollieFetch(
  supabase: SupabaseClient,
  method: string,
  path: string,
  body: unknown | null,
  agencyId: string | null,
  idempotencyKey?: string
): Promise<{ status: number; data: Record<string, unknown> }> {
  const url = `${MOLLIE_BASE_URL}${path}`;
  const apiKey = getApiKey();

  // Log outgoing request
  await logApiCall(supabase, 'mollie', 'request', path, method, null, body, agencyId, false);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: Record<string, unknown> = {};
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || contentType.includes('application/hal+json')) {
    data = (await res.json()) as Record<string, unknown>;
  }

  const fehler = !res.ok;

  // Log response
  await logApiCall(
    supabase,
    'mollie',
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
      `Mollie API Fehler ${res.status}: ${JSON.stringify(data)}`
    );
  }

  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------
export async function createCustomer(
  supabase: SupabaseClient,
  params: {
    name: string;
    email: string;
    agency_id: string;
  }
): Promise<string> {
  const { data } = await mollieFetch(
    supabase,
    'POST',
    '/customers',
    {
      name: params.name,
      email: params.email,
      metadata: JSON.stringify({ agency_id: params.agency_id }),
    },
    params.agency_id
  );

  return data.id as string;
}

// ---------------------------------------------------------------------------
// First payment (creates mandate via checkout)
// ---------------------------------------------------------------------------
export async function createFirstPayment(
  supabase: SupabaseClient,
  params: {
    customerId: string;
    amount: number;
    description: string;
    redirectUrl: string;
    webhookUrl: string;
    agency_id: string;
  }
): Promise<{ paymentId: string; checkoutUrl: string }> {
  const { data } = await mollieFetch(
    supabase,
    'POST',
    '/payments',
    {
      amount: formatAmount(params.amount),
      customerId: params.customerId,
      sequenceType: 'first',
      description: params.description,
      redirectUrl: params.redirectUrl,
      webhookUrl: params.webhookUrl,
    },
    params.agency_id
  );

  const links = data._links as Record<string, { href: string }> | undefined;
  const checkoutUrl = links?.checkout?.href ?? '';

  return {
    paymentId: data.id as string,
    checkoutUrl,
  };
}

// ---------------------------------------------------------------------------
// Recurring payment (uses existing mandate)
// ---------------------------------------------------------------------------
export async function createRecurringPayment(
  supabase: SupabaseClient,
  params: {
    customerId: string;
    mandateId: string;
    amount: number;
    description: string;
    webhookUrl: string;
    agency_id: string;
    idempotency_key: string;
  }
): Promise<string> {
  const { data } = await mollieFetch(
    supabase,
    'POST',
    '/payments',
    {
      amount: formatAmount(params.amount),
      customerId: params.customerId,
      mandateId: params.mandateId,
      sequenceType: 'recurring',
      description: params.description,
      webhookUrl: params.webhookUrl,
    },
    params.agency_id,
    params.idempotency_key
  );

  return data.id as string;
}

// ---------------------------------------------------------------------------
// Mandate
// ---------------------------------------------------------------------------
export async function getMandate(
  supabase: SupabaseClient,
  customerId: string,
  mandateId: string
): Promise<Record<string, unknown>> {
  const { data } = await mollieFetch(
    supabase,
    'GET',
    `/customers/${customerId}/mandates/${mandateId}`,
    null,
    null
  );
  return data;
}

export async function revokeMandate(
  supabase: SupabaseClient,
  customerId: string,
  mandateId: string
): Promise<void> {
  await mollieFetch(
    supabase,
    'DELETE',
    `/customers/${customerId}/mandates/${mandateId}`,
    null,
    null
  );
}

// ---------------------------------------------------------------------------
// Payment status
// ---------------------------------------------------------------------------
export async function getPayment(
  supabase: SupabaseClient,
  paymentId: string
): Promise<Record<string, unknown>> {
  const { data } = await mollieFetch(
    supabase,
    'GET',
    `/payments/${paymentId}`,
    null,
    null
  );
  return data;
}
