import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { twilioConfig } from '@/lib/twilio/config';
import { voiceAccessToken } from '@/lib/twilio/token';
import { telefonieGrund } from '@/lib/twilio/zugriff';

/** Zugangstoken für das Telefonieren im Browser (1 Stunde gültig). Ohne Einrichtung/Freigabe: verfuegbar=false */
export async function GET() {
  const user = await getCurrentUser();
  const grund = await telefonieGrund(createAdminClient(), user);
  if (grund || !user) return NextResponse.json({ verfuegbar: false, grund });
  const cfg = twilioConfig()!;
  return NextResponse.json({ verfuegbar: true, token: voiceAccessToken(cfg, user.id), identity: user.id }, { headers: { 'Cache-Control': 'no-store' } });
}
