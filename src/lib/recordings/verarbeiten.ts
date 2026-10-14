import type { SupabaseClient } from '@supabase/supabase-js';
import { transcribeAudio } from './transcribe';
import { analyzeCallRecording } from './analyze';

/** Aufnahme transkribieren (Whisper) und mit dem Telefonskript des Kunden auswerten */
export async function verarbeiteAufnahme(
  supabase: SupabaseClient,
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
