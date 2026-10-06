import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { canWriteRole } from '@/lib/recruiting/scope';
import { isUuid } from '@/lib/supabase/filters';
import { logActivity } from '@/lib/activity/log';
import { personaKonfig, personaSchluessel } from '@/lib/persona/konfig';
import { holeKandidat, ladeEin, PersonaFehler } from '@/lib/persona/client';
import { mappeKandidat } from '@/lib/persona/mapping';

const FELDER =
  'id, agency_id, name, email, persona_status, persona_typ, persona_typ_key, persona_fit, persona_score, persona_warnungen, persona_dimensionen, persona_report_url, persona_invite_url, persona_eingeladen_am, persona_abgeschlossen_am';

/** Bewerber laden und prüfen, ob er zur Cloud des Nutzers gehört */
async function bewerberImZugriff(id: string) {
  const user = await getCurrentUser();
  if (!user) return { fehler: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) };
  if (!isUuid(id)) return { fehler: NextResponse.json({ error: 'Ungültige ID' }, { status: 400 }) };
  const svc = createAdminClient();
  const { data } = await svc.from('candidates').select(FELDER).eq('id', id).maybeSingle();
  const c = data as (Record<string, unknown> & { id: string; agency_id: string; name: string; email: string | null }) | null;
  if (!c) return { fehler: NextResponse.json({ error: 'Bewerber nicht gefunden' }, { status: 404 }) };
  const effektiv = await getEffectiveAgencyId();
  // Kunde: nur eigene Agentur. Intern: nur in der gerade geöffneten Kunden-Cloud.
  if (effektiv !== c.agency_id) return { fehler: NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 }) };
  return { user, svc, c };
}

/** GET: Persona-Stand des Bewerbers (+ ob die Funktion freigeschaltet ist) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await bewerberImZugriff(id);
  if ('fehler' in r) return r.fehler;
  const konfig = await personaKonfig(r.svc, r.c.agency_id);
  const { agency_id: _a, ...rest } = r.c;
  void _a;
  return NextResponse.json({
    freigeschaltet: konfig.aktiv && konfig.hatSchluessel,
    darfSenden: isInternal(r.user.role) || canWriteRole(r.user.role),
    bewerber: rest,
  });
}

/** POST { aktion: 'senden' | 'aktualisieren' } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await bewerberImZugriff(id);
  if ('fehler' in r) return r.fehler;
  if (!isInternal(r.user.role) && !canWriteRole(r.user.role)) return NextResponse.json({ error: 'Nur Lesezugriff' }, { status: 403 });

  const schluessel = await personaSchluessel(r.svc, r.c.agency_id);
  if (!schluessel) return NextResponse.json({ error: 'Der Persona-Test ist für dein Unternehmen nicht freigeschaltet.' }, { status: 403 });

  const { aktion } = (await req.json().catch(() => ({}))) as { aktion?: string };
  try {
    if (aktion === 'aktualisieren') {
      const roh = await holeKandidat(schluessel, r.c.id);
      const e = mappeKandidat(roh);
      const update = e.persona_status === 'abgeschlossen' ? e : { persona_status: e.persona_status };
      await r.svc.from('candidates').update(update).eq('id', r.c.id).eq('agency_id', r.c.agency_id);
      return NextResponse.json({ ok: true, status: e.persona_status });
    }

    // senden: ohne E-Mail keinen Mailversand, Link wird zum Weitergeben (z. B. WhatsApp) angezeigt
    const mitMail = !!r.c.email;
    const res = await ladeEin(schluessel, {
      name: r.c.name || 'Bewerber',
      email: r.c.email || `bewerber-${r.c.id}@keine-email.zoeppmedia.de`,
      external_id: r.c.id,
      send_email: mitMail,
    });
    const jetzt = new Date().toISOString();
    await r.svc
      .from('candidates')
      .update({ persona_status: 'eingeladen', persona_invite_url: res.invite_url ?? null, persona_eingeladen_am: jetzt })
      .eq('id', r.c.id)
      .eq('agency_id', r.c.agency_id);
    await logActivity(r.svc, {
      agency_id: r.c.agency_id,
      user_id: r.user.id,
      candidate_id: r.c.id,
      action: mitMail ? 'Persona-Test per E-Mail verschickt' : 'Persona-Test-Link erstellt (ohne E-Mail)',
      action_type: 'other',
      metadata: { kind: 'persona_test' },
    });
    return NextResponse.json({ ok: true, inviteUrl: res.invite_url ?? null, perMail: mitMail });
  } catch (err) {
    const status = err instanceof PersonaFehler ? (err.status === 402 ? 402 : 502) : 502;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Persona-Test nicht erreichbar' }, { status });
  }
}
