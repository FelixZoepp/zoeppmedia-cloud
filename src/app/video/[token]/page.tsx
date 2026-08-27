import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export default async function VideoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: view } = await supabase
    .from('video_views')
    .select('video_url, viewed_at')
    .eq('view_token', token)
    .single();

  if (!view) redirect('/');

  // Track view
  if (!view.viewed_at) {
    await supabase
      .from('video_views')
      .update({ viewed_at: new Date().toISOString() })
      .eq('view_token', token);
  }

  redirect(view.video_url);
}
