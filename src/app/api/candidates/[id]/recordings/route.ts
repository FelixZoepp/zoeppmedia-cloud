import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { transcribeAudio } from '@/lib/recordings/transcribe';
import { analyzeCallRecording } from '@/lib/recordings/analyze';
import { logActivity } from '@/lib/activity/log';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('call_recordings')
    .select('*')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const recordingType = (formData.get('recording_type') as string) || 'erstgespraech';

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  // Get candidate for agency_id
  const { data: candidate } = await supabase
    .from('candidates')
    .select('agency_id')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  const admin = createAdminClient();

  // 1. Upload file to Supabase Storage
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${candidate.agency_id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await admin.storage
    .from('call-recordings')
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = await admin.storage
    .from('call-recordings')
    .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

  const fileUrl = urlData?.signedUrl || '';

  // 2. Create recording record (pending transcription)
  const { data: recording, error: insertError } = await admin
    .from('call_recordings')
    .insert({
      candidate_id: id,
      agency_id: candidate.agency_id,
      uploaded_by: user.id,
      recording_type: recordingType,
      file_url: fileUrl,
      file_name: file.name,
      file_size_bytes: file.size,
      transcript_status: 'processing',
      analysis_status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 3. Transcribe in background (don't block response)
  processRecording(admin, recording.id, buffer, file.name, candidate.agency_id, recordingType).catch(() => {});

  await logActivity(supabase, {
    agency_id: candidate.agency_id,
    user_id: user.id,
    candidate_id: id,
    action: `Gesprächsaufnahme hochgeladen: ${file.name}`,
    action_type: 'recording_upload',
    metadata: { recording_type: recordingType, file_name: file.name, file_size_bytes: file.size },
  });

  return NextResponse.json(recording, { status: 201 });
}

async function processRecording(
  supabase: ReturnType<typeof createAdminClient>,
  recordingId: string,
  audioBuffer: Buffer,
  fileName: string,
  agencyId: string,
  recordingType: string
) {
  // Step 1: Transcribe
  let transcript = '';
  try {
    transcript = await transcribeAudio(audioBuffer, fileName);
    await supabase
      .from('call_recordings')
      .update({ transcript, transcript_status: 'done', analysis_status: 'processing' })
      .eq('id', recordingId);
  } catch {
    await supabase
      .from('call_recordings')
      .update({ transcript_status: 'failed' })
      .eq('id', recordingId);
    return;
  }

  // Step 2: Get phone script for comparison
  let phoneScript: string | null = null;
  try {
    const { data: scripts } = await supabase
      .from('content_library')
      .select('content')
      .eq('agency_id', agencyId)
      .eq('content_type', 'phone_script')
      .in('status', ['approved_internal', 'approved', 'deployed'])
      .order('created_at', { ascending: false })
      .limit(1);
    phoneScript = scripts?.[0]?.content || null;
  } catch {
    // No script available — analysis will note this
  }

  // Step 3: Analyze
  try {
    const analysis = await analyzeCallRecording(transcript, phoneScript, recordingType);
    await supabase
      .from('call_recordings')
      .update({ analysis, analysis_status: 'done' })
      .eq('id', recordingId);
  } catch {
    await supabase
      .from('call_recordings')
      .update({ analysis_status: 'failed' })
      .eq('id', recordingId);
  }
}
