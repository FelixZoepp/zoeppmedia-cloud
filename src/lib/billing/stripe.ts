import { SupabaseClient } from '@supabase/supabase-js';
import { logApiCall } from './lexoffice';

const STRIPE_BASE = 'https://api.stripe.com/v1';

function stripeHeaders(idempotencyKey?: string): Record<string, string> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY nicht konfiguriert');
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return headers;
}

/**
 * Encode params for Stripe's form-urlencoded API.
 * Supports nested objects via bracket notation: metadata[key]=value
 */
function encodeParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  function encode(prefix: string, value: unknown) {
    if (value === null || value === undefined) return;
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        encode(prefix ? `${prefix}[${k}]` : k, v);
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => encode(`${prefix}[${i}]`, v));
    } else {
      parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
    }
  }
  encode('', params);
  return parts.join('&');
}

// ---------------------------------------------------------------------------
// Internal fetch wrapper — logs request + response to integration_logs
// ---------------------------------------------------------------------------
async function stripeFetch(
  supabase: SupabaseClient,
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  agencyId: string | null,
  idempotencyKey?: string
): Promise<{ status: number; data: Record<string, unknown> }> {
  const url = `${STRIPE_BASE}${path}`;

  // Log outgoing request
  await logApiCall(supabase, 'stripe', 'request', path, method, null, body, agencyId, false);

  const headers = stripeHeaders(idempotencyKey);

  const res = await fetch(url, {
    method,
    headers,
    body: body ? encodeParams(body) : undefined,
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
    'stripe',
    'response',
    path,
    method,
    res.status,
    data,
    agencyId,
    fehler
  );

  if (fehler) {
    const errorObj = data.error as Record<string, unknown> | undefined;
    const message = errorObj?.message ?? JSON.stringify(data);
    throw new Error(`Stripe API Fehler ${res.status}: ${message}`);
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
    address?: { line1: string; city: string; postal_code: string; country: string };
  }
): Promise<string> {
  const body: Record<string, unknown> = {
    name: params.name,
    email: params.email,
    metadata: { agency_id: params.agency_id },
  };
  if (params.address) {
    body.address = params.address;
  }

  const { data } = await stripeFetch(
    supabase,
    'POST',
    '/customers',
    body,
    params.agency_id
  );

  return data.id as string;
}

// ---------------------------------------------------------------------------
// Setup Intent (SEPA mandate setup — for programmatic IBAN collection)
// ---------------------------------------------------------------------------
export async function createSetupIntent(
  supabase: SupabaseClient,
  params: {
    customerId: string;
    agency_id: string;
  }
): Promise<{ setupIntentId: string; clientSecret: string }> {
  const { data } = await stripeFetch(
    supabase,
    'POST',
    '/setup_intents',
    {
      customer: params.customerId,
      'payment_method_types[0]': 'sepa_debit',
      metadata: { agency_id: params.agency_id },
    },
    params.agency_id
  );

  return {
    setupIntentId: data.id as string,
    clientSecret: data.client_secret as string,
  };
}

// ---------------------------------------------------------------------------
// Checkout Session (SEPA mandate setup — Stripe hosts the IBAN form)
// ---------------------------------------------------------------------------
export async function createCheckoutSession(
  supabase: SupabaseClient,
  params: {
    customerId: string;
    agency_id: string;
    successUrl: string;
    cancelUrl: string;
  }
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const { data } = await stripeFetch(
    supabase,
    'POST',
    '/checkout/sessions',
    {
      customer: params.customerId,
      mode: 'setup',
      'payment_method_types[0]': 'sepa_debit',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { agency_id: params.agency_id },
    },
    params.agency_id
  );

  return {
    sessionId: data.id as string,
    checkoutUrl: data.url as string,
  };
}

// ---------------------------------------------------------------------------
// Payment Intent (charge using saved SEPA payment method)
// ---------------------------------------------------------------------------
export async function createPaymentIntent(
  supabase: SupabaseClient,
  params: {
    customerId: string;
    paymentMethodId: string;
    amount: number; // in cents!
    description: string;
    agency_id: string;
    idempotency_key: string;
    metadata?: Record<string, string>;
  }
): Promise<{ paymentIntentId: string; status: string }> {
  const body: Record<string, unknown> = {
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    amount: params.amount,
    currency: 'eur',
    description: params.description,
    confirm: 'true',
    off_session: 'true',
    'payment_method_types[0]': 'sepa_debit',
    metadata: {
      agency_id: params.agency_id,
      ...(params.metadata ?? {}),
    },
  };

  const { data } = await stripeFetch(
    supabase,
    'POST',
    '/payment_intents',
    body,
    params.agency_id,
    params.idempotency_key
  );

  return {
    paymentIntentId: data.id as string,
    status: data.status as string,
  };
}

// ---------------------------------------------------------------------------
// Get Payment Intent
// ---------------------------------------------------------------------------
export async function getPaymentIntent(
  supabase: SupabaseClient,
  paymentIntentId: string
): Promise<Record<string, unknown>> {
  const { data } = await stripeFetch(
    supabase,
    'GET',
    `/payment_intents/${paymentIntentId}`,
    null,
    null
  );
  return data;
}

// ---------------------------------------------------------------------------
// List payment methods for customer
// ---------------------------------------------------------------------------
export async function listPaymentMethods(
  supabase: SupabaseClient,
  customerId: string
): Promise<Array<{ id: string; type: string; sepa_debit?: { last4: string } }>> {
  const { data } = await stripeFetch(
    supabase,
    'GET',
    `/payment_methods?customer=${encodeURIComponent(customerId)}&type=sepa_debit`,
    null,
    null
  );

  const items = data.data as Array<Record<string, unknown>> | undefined;
  if (!items) return [];

  return items.map((pm) => ({
    id: pm.id as string,
    type: pm.type as string,
    sepa_debit: pm.sepa_debit as { last4: string } | undefined,
  }));
}

// ---------------------------------------------------------------------------
// Detach payment method (revoke mandate)
// ---------------------------------------------------------------------------
export async function detachPaymentMethod(
  supabase: SupabaseClient,
  paymentMethodId: string
): Promise<void> {
  await stripeFetch(
    supabase,
    'POST',
    `/payment_methods/${paymentMethodId}/detach`,
    {},
    null
  );
}

// ---------------------------------------------------------------------------
// Retrieve Checkout Session (for webhook processing)
// ---------------------------------------------------------------------------
export async function getCheckoutSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Record<string, unknown>> {
  const { data } = await stripeFetch(
    supabase,
    'GET',
    `/checkout/sessions/${sessionId}?expand[0]=setup_intent`,
    null,
    null
  );
  return data;
}
