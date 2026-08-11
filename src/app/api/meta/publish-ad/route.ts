import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { publishAd } from '@/lib/meta/api';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ad_id } = await request.json();
  if (!ad_id) {
    return NextResponse.json({ error: 'ad_id fehlt' }, { status: 400 });
  }

  try {
    await publishAd(ad_id);
    return NextResponse.json({ status: 'ACTIVE' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Meta API Fehler' },
      { status: 500 }
    );
  }
}
