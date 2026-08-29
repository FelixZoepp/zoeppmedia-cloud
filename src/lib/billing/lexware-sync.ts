import { SupabaseClient } from '@supabase/supabase-js';

const LEXOFFICE_BASE = 'https://api.lexoffice.io/v1';

function lexHeaders() {
  const key = process.env.LEXOFFICE_API_KEY;
  if (!key) throw new Error('LEXOFFICE_API_KEY nicht konfiguriert');
  return {
    'Authorization': `Bearer ${key}`,
    'Accept': 'application/json',
  };
}

/**
 * Sync a Lexware Office contact's data into the agencies table.
 * Call this when creating a customer or on demand.
 */
export async function syncLexwareContact(
  supabase: SupabaseClient,
  agencyId: string,
  lexContactId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${LEXOFFICE_BASE}/contacts/${lexContactId}`, {
      headers: lexHeaders(),
    });

    if (!res.ok) {
      return { success: false, error: `Lexware API Fehler: ${res.status}` };
    }

    const contact = await res.json();
    const company = contact.company || {};
    const persons = company.contactPersons || [];
    const person = persons.find((p: { primary?: boolean }) => p.primary) || persons[0] || {};
    const billing = (contact.addresses?.billing || [])[0] || {};
    const emails = contact.emailAddresses?.business || [];
    const phones = contact.phoneNumbers?.business || [];

    const updates: Record<string, unknown> = {};

    if (company.name) updates.name = company.name;
    if (person.firstName || person.lastName) {
      updates.contact_name = [person.firstName, person.lastName].filter(Boolean).join(' ');
    }
    if (emails[0]) {
      updates.email = emails[0];
      updates.rechnungsmail = emails[0];
    }
    if (phones[0]) updates.phone = phones[0];
    if (billing.street || billing.zip || billing.city) {
      updates.anschrift = [billing.street, [billing.zip, billing.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    }
    if (company.vatRegistrationId) updates.ust_id = company.vatRegistrationId;

    if (Object.keys(updates).length === 0) {
      return { success: true };
    }

    const { error } = await supabase
      .from('agencies')
      .update(updates)
      .eq('id', agencyId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannt' };
  }
}

/**
 * Find a Lexware contact by name and return the ID.
 */
export async function findLexwareContact(name: string): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(`${LEXOFFICE_BASE}/contacts?name=${encodeURIComponent(name)}`, {
      headers: lexHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const contact = data.content?.[0];
    if (!contact) return null;
    return { id: contact.id, name: contact.company?.name || contact.id };
  } catch {
    return null;
  }
}

/**
 * List all Lexware contacts for import.
 */
export async function listLexwareContacts(): Promise<Array<{
  id: string;
  name: string;
  contact_person: string;
  email: string;
  customer_number: number | null;
}>> {
  try {
    const res = await fetch(`${LEXOFFICE_BASE}/contacts?page=0&size=250&customer=true`, {
      headers: lexHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.content || []).map((c: Record<string, unknown>) => {
      const company = (c.company || {}) as Record<string, unknown>;
      const persons = (company.contactPersons || []) as Array<Record<string, unknown>>;
      const person = persons[0] || {};
      const emails = ((c.emailAddresses || {}) as Record<string, unknown[]>).business || [];
      const roles = (c.roles || {}) as Record<string, Record<string, unknown>>;
      return {
        id: c.id as string,
        name: (company.name || '') as string,
        contact_person: [person.firstName, person.lastName].filter(Boolean).join(' '),
        email: (emails[0] || '') as string,
        customer_number: (roles.customer?.number || null) as number | null,
      };
    });
  } catch {
    return [];
  }
}
