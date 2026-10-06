import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId, isInternal, type CurrentUser } from '@/lib/auth';

/**
 * Agentur des aktuellen Requests für die Kunden-Cloud:
 * Kunden-Nutzer → eigene Agentur; Admin/Innendienst → die gerade geöffnete Kunden-Cloud (Impersonation).
 * Liefert sonst eine fertige Fehler-Antwort (401 ohne Login, 400 ohne geöffnete Kunden-Cloud).
 */
export async function requireAgencyScope(): Promise<{ user: CurrentUser; agencyId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { error: isInternal(user.role) ? 'Bitte zuerst in eine Kunden-Cloud einloggen.' : 'Keine Agentur zugeordnet' },
      { status: 400 },
    );
  }
  return { user, agencyId };
}
