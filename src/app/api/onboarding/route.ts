import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, after } from 'next/server';
import { bereinigeOnboardingBody, darfOnboardingSchreiben } from '@/lib/onboarding/body';
import { logActivity } from '@/lib/activity/log';
import { signalSafe } from '@/lib/fulfillment/engine';
import { richteSetupEin } from '@/lib/fulfillment/auto-setup';
import { istAutomatikKunde } from '@/lib/fulfillment/automatik';

// Das automatische Setup (inkl. KI-Generator) läuft nach der Antwort weiter
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.agency_id) return NextResponse.json({ error: 'No agency' }, { status: 400 });
  if (!darfOnboardingSchreiben(profile.role)) return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 403 });

  const body = bereinigeOnboardingBody(await req.json());
  const admin = createAdminClient();

  // Check if a draft already exists — update it instead of inserting
  const { data: existing } = await admin
    .from('onboarding_submissions')
    .select('id, status')
    .eq('agency_id', profile.agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  // Erneutes Absenden eines schon abgeschlossenen Onboardings löst kein neues Setup aus
  const warSchonAbgeschlossen = (existing as { status?: string } | null)?.status === 'completed';

  let data;
  let error;

  if (existing) {
    // Update existing draft to completed
    const result = await admin
      .from('onboarding_submissions')
      .update({ ...body, status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('agency_id', profile.agency_id)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } else {
    // Create new submission
    const result = await admin
      .from('onboarding_submissions')
      .insert({ ...body, agency_id: profile.agency_id, status: 'completed' })
      .select()
      .single();
    data = result.data;
    error = result.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Onboarding abschließen; Video-Dreh und Reels liegen in agencies.settings
  // (die Spalten has_video_shoot/reels_per_month gibt es in der Datenbank nicht – das Update schlug früher komplett fehl)
  const { data: agencyRow } = await admin.from('agencies').select('settings').eq('id', profile.agency_id).maybeSingle();
  const { error: flagError } = await admin
    .from('agencies')
    .update({
      onboarding_completed: true,
      settings: {
        ...(((agencyRow as { settings?: Record<string, unknown> } | null)?.settings) ?? {}),
        has_video_shoot: !!body.has_video_shoot,
        reels_per_month: Number(body.reels_per_month) || 0,
      },
    })
    .eq('id', profile.agency_id);
  if (flagError) console.error('[onboarding] Abschluss nicht gespeichert', flagError);

  // Fulfillment v2: Inhaltsfunnel ausgefüllt
  await signalSafe(admin, profile.agency_id, 'onboarding_formular');

  // Log activity
  await logActivity(admin, {
    agency_id: profile.agency_id,
    user_id: user.id,
    action: 'Onboarding abgeschlossen',
    action_type: 'onboarding_complete',
  });

  // Setup baut sich selbst: Stelle, Bot, Terminzeiten, KI-Generator (idempotent, im Hintergrund)
  // – nur für Automatik-Kunden (neue Fulfillment-Strecke), Bestandskunden unverändert
  if (!warSchonAbgeschlossen) {
    const agencyId = profile.agency_id as string;
    after(async () => {
      try {
        const svc = createAdminClient();
        if (!(await istAutomatikKunde(svc, agencyId))) return;
        await richteSetupEin(svc, agencyId);
      } catch (err) {
        console.error('[onboarding] Automatisches Setup fehlgeschlagen', agencyId, err);
      }
    });
  }

  return NextResponse.json(data);
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let query = supabase.from('onboarding_submissions').select('*');

  if (profile.role !== 'admin' && profile.role !== 'employee') {
    query = query.eq('agency_id', profile.agency_id);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
