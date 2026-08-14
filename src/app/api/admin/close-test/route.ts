import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'CLOSE_API_KEY not configured' }, { status: 500 });
  }

  try {
    const res = await fetch('https://api.close.com/api/v1/pipeline/', {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    return NextResponse.json({ ok: res.ok, pipelines: data.data?.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) ?? data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
