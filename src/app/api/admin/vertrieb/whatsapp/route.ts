import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { ZEITRÄUME, zeitraumFür, type Zeitraum } from '@/lib/sales-controlling/laden';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { berechneWirkung, erinnerungsWirkung } from '@/lib/sales/whatsapp-wirkung';

/** GET ?zeitraum= – Wirkung der Sales-WhatsApp-Nachrichten je Art */
export async function GET(req: NextRequest) {
  if (!(await darfSalesControlling())) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const g = req.nextUrl.searchParams.get('zeitraum') ?? '';
  const z: Zeitraum = (ZEITRÄUME as readonly string[]).includes(g) ? (g as Zeitraum) : 'monat';
  const { von, bis } = zeitraumFür(z, new Date());
  const bisPlus = new Date(new Date(bis).getTime() + 7 * 864e5).toISOString();
  const svc = createAdminClient();

  const [{ data: convs }, { data: tmpls }] = await Promise.all([
    svc.from('conversations').select('id, candidate_id').eq('agency_id', SALES_AGENCY_ID),
    svc.from('whatsapp_templates').select('id, preset_key, name').eq('agency_id', SALES_AGENCY_ID),
  ]);
  const kontaktVon = new Map(((convs ?? []) as Array<{ id: string; candidate_id: string }>).map((c) => [c.id, c.candidate_id]));
  const presetVon = new Map(((tmpls ?? []) as Array<{ id: string; preset_key: string | null; name: string }>).map((t) => [t.id, t.preset_key ?? t.name]));
  const convIds = [...kontaktVon.keys()];

  const [{ data: aus }, { data: ein }, { data: klicks }, { data: buch }, { data: steps }] = await Promise.all([
    convIds.length
      ? svc.from('messages').select('conversation_id, template_id, status, created_at').in('conversation_id', convIds).eq('direction', 'out').not('template_id', 'is', null).gte('created_at', von).lt('created_at', bis)
      : Promise.resolve({ data: [] }),
    convIds.length
      ? svc.from('messages').select('conversation_id, created_at').in('conversation_id', convIds).eq('direction', 'in').gte('created_at', von).lt('created_at', bisPlus)
      : Promise.resolve({ data: [] }),
    svc.from('activity_log').select('candidate_id, metadata, created_at').eq('agency_id', SALES_AGENCY_ID).eq('metadata->>kind', 'sales_link_click').gte('created_at', von).lt('created_at', bisPlus),
    svc.from('calendly_events').select('candidate_id, created_at').eq('agency_id', SALES_AGENCY_ID).gte('created_at', von).lt('created_at', bisPlus),
    svc.from('client_steps').select('kunde_erinnert_am, erledigt_am').gte('kunde_erinnert_am', von).lt('kunde_erinnert_am', bis),
  ]);

  const zeilen = berechneWirkung({
    ausgehend: ((aus ?? []) as Array<{ conversation_id: string; template_id: string; status: string | null; created_at: string }>).map((m) => ({
      kontakt: kontaktVon.get(m.conversation_id) ?? '',
      conversation: m.conversation_id,
      preset: presetVon.get(m.template_id) ?? '',
      status: m.status,
      am: m.created_at,
    })),
    eingehend: ((ein ?? []) as Array<{ conversation_id: string; created_at: string }>).map((m) => ({ conversation: m.conversation_id, am: m.created_at })),
    klicks: ((klicks ?? []) as Array<{ candidate_id: string; metadata: { source?: string } | null; created_at: string }>).map((k) => ({
      kontakt: k.candidate_id,
      source: k.metadata?.source ?? '',
      am: k.created_at,
    })),
    buchungen: ((buch ?? []) as Array<{ candidate_id: string | null; created_at: string }>).filter((b) => b.candidate_id).map((b) => ({ kontakt: b.candidate_id!, am: b.created_at })),
  });
  return NextResponse.json({ zeilen, kundenErinnerung: erinnerungsWirkung((steps ?? []) as Array<{ kunde_erinnert_am: string | null; erledigt_am: string | null }>) });
}
