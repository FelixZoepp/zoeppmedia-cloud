import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AD_STAGES, AD_TYPEN, moveAd, type AdStage } from '@/lib/ads/ads';

const EDITABLE = ['titel', 'idee', 'typ', 'assignee_id', 'faellig_am', 'material_urls', 'asset_url', 'asset_path'] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = createAdminClient();

  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) patch[k] = body[k] === '' ? null : body[k];
  if ('typ' in patch && !AD_TYPEN.some((t) => t.key === patch.typ)) delete patch.typ;
  if ('material_urls' in patch && !Array.isArray(patch.material_urls)) delete patch.material_urls;
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    await svc.from('ad_items').update(patch).eq('id', id);
  }

  if (typeof body.stage === 'string') {
    const valid = [...AD_STAGES.map((s) => s.key), 'verworfen'];
    if (!valid.includes(body.stage)) return NextResponse.json({ error: 'Unbekannte Spalte' }, { status: 400 });
    // Live nur nach Kundenfreigabe – außer man bestätigt ausdrücklich (z. B. Freigabe kam per Telefon)
    if (body.stage === 'live' && body.ohne_freigabe !== true) {
      const { data: cur } = await svc.from('ad_items').select('stage').eq('id', id).maybeSingle();
      const stage = (cur as { stage: string } | null)?.stage;
      if (stage && stage !== 'bereit' && stage !== 'live') {
        return NextResponse.json({ error: 'Der Kunde hat diese Ad noch nicht freigegeben.', code: 'freigabe_fehlt' }, { status: 409 });
      }
    }
    await moveAd(svc, id, body.stage as AdStage, { userId: user.id, kommentar: (body.kommentar as string) ?? null });
  }
  return NextResponse.json({ ok: true });
}
