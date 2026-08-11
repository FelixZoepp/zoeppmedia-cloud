import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { uploadImage, createAdCreative, createAd } from '@/lib/meta/api';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agency_id, image_url, headline, body, description, link_url, cta_type, ad_set_id } =
    await request.json();

  if (!agency_id || !headline || !body) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: agency } = await supabase
    .from('agencies')
    .select('meta_ad_account_id, meta_page_id')
    .eq('id', agency_id)
    .single();

  if (!agency?.meta_ad_account_id || !agency?.meta_page_id) {
    return NextResponse.json({ error: 'Meta Ad Account nicht konfiguriert' }, { status: 400 });
  }

  try {
    // 1. Upload image if provided
    let imageHash: string | undefined;
    if (image_url) {
      imageHash = await uploadImage(agency.meta_ad_account_id, image_url);
    }

    // 2. Create ad creative
    const creativeId = await createAdCreative(agency.meta_ad_account_id, {
      name: `Recruiting Ad — ${headline}`,
      pageId: agency.meta_page_id,
      imageHash,
      headline,
      body,
      description,
      linkUrl: link_url,
      ctaType: cta_type || 'APPLY_NOW',
    });

    // 3. Create ad as PAUSED (only when ad_set_id is provided)
    let adId: string | undefined;
    if (ad_set_id) {
      adId = await createAd(
        agency.meta_ad_account_id,
        ad_set_id,
        creativeId,
        `Ad — ${headline}`
      );
    }

    return NextResponse.json({ ad_id: adId ?? null, creative_id: creativeId, status: adId ? 'PAUSED' : 'CREATIVE_ONLY' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Meta API Fehler' },
      { status: 500 }
    );
  }
}
