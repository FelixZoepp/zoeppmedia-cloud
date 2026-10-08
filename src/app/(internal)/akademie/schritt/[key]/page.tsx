import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ARTIKEL_SPALTEN, sichereStartInhalte, type Artikel } from '@/lib/akademie/daten';
import { darfSehen, ladeZugriff } from '@/lib/akademie/zugriff';
import { SCHRITT_SOP } from '@/lib/akademie/schritt-index';

/** Ablauf-Schritt → passende SOP (die erste sichtbare, die den Schritt verknüpft) */
export default async function SchrittPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const svc = createAdminClient();
  await sichereStartInhalte(svc);
  const z = await ladeZugriff(svc, { id: user.id, role: user.role, funktion: user.funktion ?? null });
  const { data } = await svc.from('akademie_artikel').select(ARTIKEL_SPALTEN).contains('step_keys', [key]).order('reihenfolge');
  const treffer = ((data ?? []) as Artikel[]).find((a) => darfSehen(a, z));
  if (treffer) redirect(`/akademie/${treffer.slug}`);
  if (SCHRITT_SOP[key]) redirect(`/akademie/${SCHRITT_SOP[key]}`);
  notFound();
}
