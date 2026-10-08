import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeArtikel, ladeVideos } from '@/lib/akademie/daten';
import { ladeZugriff } from '@/lib/akademie/zugriff';
import { POSITIONEN } from '@/lib/akademie/positionen';
import { ArtikelEditor } from './editor';

export default async function ArtikelBearbeitenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/akademie');
  const svc = createAdminClient();
  const z = await ladeZugriff(svc, { id: user.id, role: user.role, funktion: user.funktion ?? null });
  const [artikel, videos] = await Promise.all([ladeArtikel(svc, slug, z), ladeVideos(svc)]);
  if (!artikel) notFound();
  return (
    <ArtikelEditor
      artikel={artikel}
      videos={videos.map((v) => ({ key: v.key, titel: v.titel }))}
      positionen={POSITIONEN.map((p) => ({ id: p.id, label: p.label }))}
    />
  );
}
