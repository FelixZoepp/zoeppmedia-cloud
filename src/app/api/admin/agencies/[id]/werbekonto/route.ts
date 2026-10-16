import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { normalisiereAdAccount } from '@/lib/meta/ad-account';
import { findeWerbekonten, pruefeWerbekonto } from '@/lib/meta/kampagnen-kosten';

/**
 * Meta-Werbekonto des Kunden prüfen bzw. finden (nur lesend, speichert nichts):
 * ?pruefen=act_… → Name, Währung, Status · ?finden=1 → alle Werbekonten, auf die der Systembenutzer Zugriff hat
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !isInternal(u.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

  const pruefen = req.nextUrl.searchParams.get('pruefen');
  if (pruefen) return NextResponse.json(await pruefeWerbekonto(pruefen));

  if (req.nextUrl.searchParams.get('finden')) {
    try {
      const konten = await findeWerbekonten();
      if (!konten) return NextResponse.json({ error: 'Meta nicht verbunden' }, { status: 409 });
      // Welche Konten sind schon bei Kunden hinterlegt?
      const { data } = await createAdminClient().from('agencies').select('id, name, meta_ad_account_id').not('meta_ad_account_id', 'is', null);
      const belegt = new Map(((data ?? []) as Array<{ id: string; name: string; meta_ad_account_id: string | null }>).map((a) => [normalisiereAdAccount(a.meta_ad_account_id), a]));
      return NextResponse.json({
        konten: konten.map((k) => {
          const a = belegt.get(k.id);
          return { ...k, kunde: a ? { id: a.id, name: a.name, dieser: a.id === id } : null };
        }),
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Werbekonten konnten nicht geladen werden' }, { status: 502 });
    }
  }
  return NextResponse.json({ error: 'pruefen oder finden angeben' }, { status: 400 });
}
