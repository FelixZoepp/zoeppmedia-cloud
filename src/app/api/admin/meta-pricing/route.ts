/**
 * GET  /api/admin/meta-pricing — listet alle Meta-Preiskategorien
 * PATCH /api/admin/meta-pricing — aktualisiert den Preis einer Kategorie
 *
 * meta_pricing ist global (keine agency_id). Nur Admins haben Zugriff.
 * Auth-Kette: getCurrentUser → 401; user.role !== 'admin' → 403.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Zod-Schema für PATCH-Body
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  category:  z.string().min(1),
  price_eur: z.number().min(0).max(10),
});

// ---------------------------------------------------------------------------
// Hilfsfunktion: Admin-Auth-Prüfung
// ---------------------------------------------------------------------------

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) };
  }
  if (user.role !== 'admin') {
    return { user: null, response: NextResponse.json({ error: 'Kein Zugriff — nur für Admins' }, { status: 403 }) };
  }
  return { user, response: null };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(_req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const svc = createAdminClient();

  const { data, error } = await svc
    .from('meta_pricing')
    .select('id, category, price_eur, updated_at')
    .order('category');

  if (error) {
    return NextResponse.json({ error: 'Fehler beim Laden der Preistabelle' }, { status: 500 });
  }

  return NextResponse.json({ pricing: data ?? [] });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  // Body einlesen und validieren
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { category, price_eur } = parsed.data;
  const svc = createAdminClient();

  // Prüfen, ob Kategorie existiert (.maybeSingle() → null wenn nicht vorhanden)
  const { data: updated, error: updateError } = await svc
    .from('meta_pricing')
    .update({ price_eur, updated_at: new Date().toISOString() })
    .eq('category', category)
    .select('id, category, price_eur, updated_at')
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: 'Fehler beim Aktualisieren' }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: `Kategorie '${category}' nicht gefunden` },
      { status: 404 },
    );
  }

  return NextResponse.json({ pricing: updated });
}
