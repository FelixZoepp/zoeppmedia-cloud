/**
 * Diagnose der Meta-Anbindung für die Werbezahlen (Job „diagnose.meta_ads“): prüft jeden hinterlegten Token,
 * ohne ihn auszugeben – nur ob gesetzt, welche Rechte er hat und ob er das Werbekonto lesen darf.
 */

import { metaAdAccountId } from './ad-account';

const GRAPH = 'https://graph.facebook.com/v21.0';
const NAMEN = ['META_ACCESS_TOKEN', 'META_SYSTEM_USER_TOKEN', 'META_CAPI_TOKEN'] as const;

async function graph(path: string, token: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`, { cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

const fehlerText = (d: Record<string, unknown>) => {
  const e = d.error as { message?: string; code?: number; error_subcode?: number } | undefined;
  return e ? `${e.code ?? ''}${e.error_subcode ? `/${e.error_subcode}` : ''}: ${e.message ?? ''}` : null;
};

export async function diagnoseMetaAds() {
  const konto = metaAdAccountId();
  const ergebnis: Record<string, unknown> = { werbekonto: konto, META_AD_ACCOUNT_ID_gesetzt: !!process.env.META_AD_ACCOUNT_ID };
  for (const name of NAMEN) {
    const token = process.env[name]?.trim();
    if (!token) {
      ergebnis[name] = 'nicht gesetzt';
      continue;
    }
    const ich = await graph('/me?fields=id,name', token);
    const rechte = await graph('/me/permissions', token);
    const konten = await graph('/me/adaccounts?fields=account_id,name&limit=50', token);
    const insights = await graph(`/${konto}/insights?fields=spend&date_preset=last_7d`, token);
    ergebnis[name] = {
      gueltig: ich.ok ? `ja (${(ich.data.name as string) ?? ich.data.id})` : fehlerText(ich.data),
      rechte: rechte.ok
        ? ((rechte.data.data as Array<{ permission: string; status: string }>) ?? []).filter((p) => p.status === 'granted').map((p) => p.permission)
        : fehlerText(rechte.data),
      werbekonten: konten.ok ? ((konten.data.data as Array<{ account_id: string; name: string }>) ?? []).map((k) => `act_${k.account_id} ${k.name}`) : fehlerText(konten.data),
      werbezahlen: insights.ok ? `ok (Spend 7 Tage: ${((insights.data.data as Array<{ spend?: string }>) ?? [])[0]?.spend ?? 0})` : fehlerText(insights.data),
    };
  }
  return ergebnis;
}
