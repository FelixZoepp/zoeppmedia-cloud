import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { istSchemaFehler } from '@/lib/appointments/termin-format';
import { istKampagnenId, ladeKampagnenListe, zuordnungenAusBewerbern } from '@/lib/kosten/kampagnen';
import { KUNDEN_MELDUNG, SYNC_MELDUNG, syncKampagnenKosten } from '@/lib/meta/kampagnen-kosten';
import { metaKundenToken, normalisiereAdAccount } from '@/lib/meta/ad-account';

const MIGRATION_FEHLT = 'Datenbank-Änderung fehlt noch';

async function intern() {
  const u = await getCurrentUser();
  return u && isInternal(u.role) ? u : null;
}

/** Kampagnen eines Kunden (?agency=) mit Ausgaben 30 Tage, Stellen-Zuordnung und Status des Werbekontos */
export async function GET(req: NextRequest) {
  if (!(await intern())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const agencyId = req.nextUrl.searchParams.get('agency') ?? '';
  if (!isUuid(agencyId)) return NextResponse.json({ error: 'Kunde fehlt' }, { status: 400 });
  const svc = createAdminClient();
  const [liste, { data: agency }] = await Promise.all([
    ladeKampagnenListe(svc, agencyId),
    svc.from('agencies').select('meta_ad_account_id, settings').eq('id', agencyId).maybeSingle(),
  ]);
  const a = agency as { meta_ad_account_id: string | null; settings: { meta_sync?: { status: string; meldung: string | null; am: string } } | null } | null;
  return NextResponse.json({
    ...liste,
    metaVerbunden: !!metaKundenToken(),
    werbekonto: normalisiereAdAccount(a?.meta_ad_account_id) ?? null,
    letzterAbgleich: a?.settings?.meta_sync ?? null,
  });
}

/**
 * Aktionen:
 * - { aktion: 'zuordnen', campaign_id, agency_id, job_id, campaign_name? } – Kampagne → Stelle
 * - { aktion: 'entfernen', campaign_id }
 * - { aktion: 'abgleichen', agency_id?, tage? } – Meta-Kosten jetzt holen (ohne agency_id: alle Kunden)
 * - { aktion: 'aus_bewerbern', agency_id? } – Zuordnungen aus vorhandenen candidates.meta_campaign (liest nur)
 */
export async function POST(req: NextRequest) {
  const user = await intern();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { aktion?: string; campaign_id?: string; agency_id?: string; job_id?: string | null; campaign_name?: string; tage?: number };
  if (b.agency_id && !isUuid(b.agency_id)) return NextResponse.json({ error: 'Ungültiger Kunde' }, { status: 400 });
  const svc = createAdminClient();

  if (b.aktion === 'abgleichen') {
    const r = await syncKampagnenKosten(svc, { tage: Number(b.tage) || 7, agencyId: b.agency_id });
    if (r.status !== 'ok') return NextResponse.json({ error: SYNC_MELDUNG[r.status], status: r.status }, { status: 409 });
    const fehler = r.kunden.find((k) => k.status !== 'ok');
    if (b.agency_id && fehler) return NextResponse.json({ error: KUNDEN_MELDUNG[fehler.status], status: fehler.status }, { status: 502 });
    return NextResponse.json({ ok: true, zeilen: r.zeilen, kunden: r.kunden.length, fehler: r.kunden.filter((k) => k.status !== 'ok').length });
  }

  if (b.aktion === 'zuordnen') {
    const campaignId = String(b.campaign_id ?? '').trim();
    if (!istKampagnenId(campaignId)) return NextResponse.json({ error: 'Ungültige Kampagnen-ID' }, { status: 400 });
    if (!b.agency_id) return NextResponse.json({ error: 'Kunde fehlt' }, { status: 400 });
    const jobId = b.job_id ? String(b.job_id) : '';
    const { data: job } = isUuid(jobId) ? await svc.from('jobs').select('id').eq('id', jobId).eq('agency_id', b.agency_id).maybeSingle() : { data: null };
    if (!job) return NextResponse.json({ error: 'Stelle gehört nicht zu diesem Kunden' }, { status: 400 });
    // Kampagne aus dem Werbekonto eines anderen Kunden? Dann nicht zuordnen
    const { data: fremd } = await svc.from('meta_kampagnen_kosten').select('agency_id').eq('campaign_id', campaignId).neq('agency_id', b.agency_id).limit(1);
    if ((fremd ?? []).length) return NextResponse.json({ error: 'Kampagne gehört zum Werbekonto eines anderen Kunden' }, { status: 400 });
    const { error } = await svc.from('meta_kampagnen_zuordnung').upsert(
      {
        campaign_id: campaignId,
        agency_id: b.agency_id,
        job_id: jobId,
        quelle: 'manuell',
        ...(b.campaign_name ? { campaign_name: String(b.campaign_name).slice(0, 300) } : {}),
        geaendert_von: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'campaign_id' },
    );
    if (error) return NextResponse.json({ error: istSchemaFehler(error) ? MIGRATION_FEHLT : error.message }, { status: istSchemaFehler(error) ? 409 : 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.aktion === 'entfernen') {
    const campaignId = String(b.campaign_id ?? '').trim();
    if (!campaignId) return NextResponse.json({ error: 'Kampagne fehlt' }, { status: 400 });
    const { error } = await svc.from('meta_kampagnen_zuordnung').delete().eq('campaign_id', campaignId);
    if (error) return NextResponse.json({ error: istSchemaFehler(error) ? MIGRATION_FEHLT : error.message }, { status: istSchemaFehler(error) ? 409 : 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.aktion === 'aus_bewerbern') {
    const { data: bestehend, error: zuErr } = await svc.from('meta_kampagnen_zuordnung').select('campaign_id');
    if (zuErr) return NextResponse.json({ error: istSchemaFehler(zuErr) ? MIGRATION_FEHLT : zuErr.message }, { status: 409 });
    // Nur lesen: Bewerber mit Kampagne + Stelle ihrer ersten Bewerbung (über alle Kunden, damit Überschneidungen auffallen)
    const kandidaten = await fetchAll<{ id: string; agency_id: string; meta_campaign: string | null; applications: Array<{ job_id: string | null; created_at: string }> | null }>((von, bis) =>
      svc.from('candidates').select('id, agency_id, meta_campaign, applications(job_id, created_at)').not('meta_campaign', 'is', null).is('deleted_at', null).order('id').range(von, bis),
    );
    const rows = kandidaten.map((k) => ({
      agency_id: k.agency_id,
      meta_campaign: k.meta_campaign,
      job_id: [...(k.applications ?? [])].sort((x, y) => x.created_at.localeCompare(y.created_at))[0]?.job_id ?? null,
    }));
    const ids = [...new Set(rows.map((r) => r.meta_campaign).filter(istKampagnenId))];
    const { data: kosten } = ids.length ? await svc.from('meta_kampagnen_kosten').select('campaign_id, agency_id').in('campaign_id', ids.slice(0, 500)) : { data: [] };
    const kunde = new Map(((kosten ?? []) as Array<{ campaign_id: string; agency_id: string }>).map((k) => [k.campaign_id, k.agency_id]));
    const vorschlag = zuordnungenAusBewerbern(rows, new Set(((bestehend ?? []) as Array<{ campaign_id: string }>).map((x) => x.campaign_id)), kunde);
    const neu = vorschlag.neu.filter((n) => !b.agency_id || n.agency_id === b.agency_id);
    if (neu.length) {
      const { error } = await svc
        .from('meta_kampagnen_zuordnung')
        .upsert(neu.map((n) => ({ ...n, quelle: 'auto', geaendert_von: user.id })), { onConflict: 'campaign_id', ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, zugeordnet: neu.length, offen: vorschlag.mehrdeutig.length, bewerber: rows.filter((r) => !b.agency_id || r.agency_id === b.agency_id).length });
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
