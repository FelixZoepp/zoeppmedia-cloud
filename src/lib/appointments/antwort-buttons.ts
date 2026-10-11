/**
 * Antworten auf die Termin-Erinnerung (Buttons „Ich komme“ / „Verschieben“) direkt verarbeiten,
 * statt sie nur in der Inbox liegen zu lassen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export function terminAntwort(text: string | null | undefined): 'kommt' | 'verschieben' | null {
  const t = (text ?? '').trim().toLowerCase();
  if (t === 'ich komme' || t === 'ich komme!' || t === 'bin dabei') return 'kommt';
  if (t === 'verschieben' || t === 'termin verschieben') return 'verschieben';
  return null;
}

export async function verarbeiteTerminAntwort(
  svc: SupabaseClient,
  p: { agencyId: string; candidateId: string; conversationId: string; waAccountId: string; telefon: string; antwort: 'kommt' | 'verschieben' },
): Promise<boolean> {
  const { data } = await svc
    .from('appointments')
    .select('id, starts_at, status, application_id')
    .eq('agency_id', p.agencyId)
    .in('status', ['booked', 'confirmed'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(10);
  const termine = (data ?? []) as Array<{ id: string; starts_at: string; status: string; application_id: string | null }>;
  // Termin dieses Bewerbers (über seine Bewerbungen)
  const { data: apps } = await svc.from('applications').select('id').eq('candidate_id', p.candidateId).eq('agency_id', p.agencyId);
  const appIds = new Set(((apps ?? []) as Array<{ id: string }>).map((a) => a.id));
  const termin = termine.find((t) => t.application_id && appIds.has(t.application_id));
  if (!termin) return false;

  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  const antworte = (body: string) =>
    sendWhatsAppMessage(svc, { agencyId: p.agencyId, conversationId: p.conversationId, candidatePhone: p.telefon, waAccountId: p.waAccountId, payload: { to: p.telefon, type: 'text', text: { body } }, senderType: 'bot', gespraechsZeiten: true }).catch(() => {});

  if (p.antwort === 'kommt') {
    await svc.from('appointments').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', termin.id).eq('agency_id', p.agencyId);
    await antworte('Super, danke für die Bestätigung! Wir freuen uns auf dich.');
    return true;
  }
  const { createNotificationForAgency, createNotificationForInternals } = await import('@/lib/notifications/create');
  const wann = new Date(termin.starts_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const meldung = { title: '🔁 Bewerber möchte Termin verschieben', body: `Termin ${wann} Uhr – bitte kurz anrufen und neuen Termin legen.`, type: 'task_due' as const, entity_type: 'candidate' as const, entity_id: p.candidateId, push_url: '/innendienst' };
  await createNotificationForAgency(svc, p.agencyId, meldung).catch(() => {});
  await createNotificationForInternals(svc, { ...meldung, agency_id: p.agencyId }).catch(() => {});
  // Innendienst-Aufgabe: sofort fällig unter „Anrufe fällig“
  await svc.from('candidates').update({ cadence_active: true, cadence_next_at: new Date().toISOString() }).eq('id', p.candidateId).eq('agency_id', p.agencyId);
  await antworte('Kein Problem! Wir melden uns kurz bei dir, um einen neuen Termin zu finden.');
  return true;
}
