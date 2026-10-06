import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { agencyLogo } from '@/lib/branding/logo';

/** Öffentlich: nur Name + Logo eines Kunden für die Login-Seite seiner Cloud */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  const { data } = await createAdminClient().from('agencies').select('name, settings').eq('slug', slug).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  return NextResponse.json(
    { name: (data as { name: string }).name, logo_url: agencyLogo((data as { settings: unknown }).settings) },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
