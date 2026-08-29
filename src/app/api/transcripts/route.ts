import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { processTranscript } from '@/lib/transcripts/process';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get('agency_id');

  let query = supabase
    .from('transcripts')
    .select('*')
    .order('created_at', { ascending: false });

  if (agencyId) {
    query = query.eq('agency_id', agencyId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') || '';

  // Handle JSON body (text paste)
  if (contentType.includes('application/json')) {
    const body = await req.json();
    const { agency_id, typ, volltext } = body;

    if (!agency_id || !typ) {
      return NextResponse.json({ error: 'agency_id und typ sind erforderlich' }, { status: 400 });
    }

    const { data: transcript, error } = await supabase
      .from('transcripts')
      .insert({
        agency_id,
        typ,
        quelle: 'einfuegen',
        volltext,
        status: volltext ? 'transkribiert' : 'hochgeladen',
        hochgeladen_von: user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If we have text, start processing async
    if (volltext) {
      const admin = createAdminClient();
      processTranscript(admin, transcript.id).catch((err) => {
        console.error('[POST /api/transcripts] processTranscript fehlgeschlagen:', err);
      });
    }

    return NextResponse.json(transcript);
  }

  // Handle multipart form data (file upload)
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const agencyId = formData.get('agency_id') as string | null;
    const typ = formData.get('typ') as string | null;

    if (!agencyId || !typ) {
      return NextResponse.json({ error: 'agency_id und typ sind erforderlich' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'Datei ist erforderlich' }, { status: 400 });
    }

    // Determine quelle based on file type
    const mimeType = file.type || '';
    let quelle: string;
    if (mimeType.startsWith('audio/')) {
      quelle = 'upload_audio';
    } else if (mimeType.startsWith('video/')) {
      quelle = 'upload_video';
    } else if (mimeType.startsWith('text/')) {
      quelle = 'upload_text';
    } else {
      // Try to detect from file extension
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'aac'].includes(ext)) {
        quelle = 'upload_audio';
      } else if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
        quelle = 'upload_video';
      } else if (['txt', 'md'].includes(ext)) {
        quelle = 'upload_text';
      } else {
        return NextResponse.json({ error: 'Nicht unterstütztes Dateiformat' }, { status: 400 });
      }
    }

    const admin = createAdminClient();

    // Ensure transcripts bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === 'transcripts');
    if (!bucketExists) {
      await admin.storage.createBucket('transcripts', { public: false });
    }

    // Upload to storage
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${agencyId}/${timestamp}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from('transcripts')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload fehlgeschlagen: ${uploadError.message}` }, { status: 500 });
    }

    // Handle text file — read content directly
    let volltext: string | null = null;
    if (quelle === 'upload_text') {
      volltext = await file.text();
    }

    // Create transcript record
    const { data: transcript, error: insertError } = await supabase
      .from('transcripts')
      .insert({
        agency_id: agencyId,
        typ,
        quelle,
        datei_url: storagePath,
        volltext,
        status: volltext ? 'transkribiert' : 'hochgeladen',
        hochgeladen_von: user.id,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Start async processing
    processTranscript(admin, transcript.id).catch((err) => {
      console.error('[POST /api/transcripts] processTranscript fehlgeschlagen:', err);
    });

    return NextResponse.json(transcript);
  }

  return NextResponse.json({ error: 'Nicht unterstützter Content-Type' }, { status: 400 });
}
