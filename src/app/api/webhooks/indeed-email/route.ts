import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseIndeedEmail, extractAgencyIdFromAddress } from '@/lib/indeed/parse-email';
import { extractTextFromPdf, extractCvData, type CvData } from '@/lib/indeed/extract-cv';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { getStagesForAgency } from '@/lib/pipeline/get-stages';

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  let agencyId: string | null = null;

  try {
    const body = await request.json();
    const to = (body.to || body.headers?.to || '').toString();
    const from = (body.from || body.headers?.from || '').toString();
    const subject = (body.subject || body.headers?.subject || '').toString();
    const htmlBody = body.html || body.text || '';
    const attachments: { filename?: string; content_type?: string; content?: string }[] = body.attachments || [];

    // 1. Extract agency ID from +tag
    agencyId = extractAgencyIdFromAddress(to);
    if (!agencyId) {
      await supabase.from('inbound_email_log').insert({
        from_address: from,
        to_address: to,
        subject,
        status: 'no_agency',
        error_message: 'No agency ID in address tag',
        raw_payload: body,
      });
      return NextResponse.json({ error: 'No agency ID' }, { status: 400 });
    }

    // 2. Validate agency exists
    const { data: agency } = await supabase.from('agencies').select('id').eq('id', agencyId).single();
    if (!agency) {
      await supabase.from('inbound_email_log').insert({
        agency_id: null,
        from_address: from,
        to_address: to,
        subject,
        status: 'no_agency',
        error_message: `Agency ${agencyId} not found`,
        raw_payload: body,
      });
      return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
    }

    // 3. Parse email body
    const parsed = parseIndeedEmail(htmlBody, subject);

    // 4. Handle PDF attachment
    let resumeUrl: string | null = null;
    let cvData: CvData = { full_name: null, email: null, phone: null, location: null, experience_summary: null, last_employer: null };

    const pdfAttachment = attachments.find(a =>
      a.content_type?.includes('pdf') || a.filename?.toLowerCase().endsWith('.pdf')
    );

    if (pdfAttachment?.content) {
      const pdfBuffer = Buffer.from(pdfAttachment.content, 'base64');

      // Save PDF to storage
      try {
        const safeName = (parsed.candidateName || 'bewerber').replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_').slice(0, 50);
        const fileName = `${agencyId}/${Date.now()}-${safeName}.pdf`;

        const { error: uploadError } = await supabase.storage
          .from('candidate-resumes')
          .upload(fileName, pdfBuffer, { contentType: 'application/pdf' });

        if (!uploadError) {
          const { data: urlData } = await supabase.storage
            .from('candidate-resumes')
            .createSignedUrl(fileName, 365 * 24 * 60 * 60); // 1 year
          resumeUrl = urlData?.signedUrl || null;
        }
      } catch {
        // Storage failed — continue without resume URL
      }

      // Extract text from PDF and run Claude
      try {
        const pdfText = await extractTextFromPdf(pdfBuffer);
        if (pdfText.length > 20) {
          cvData = await extractCvData(pdfText);
        }
      } catch {
        // PDF parsing or AI failed — continue with email data only
      }
    }

    // 5. Merge data: CV wins over email-body for overlapping fields
    const finalName = cvData.full_name || parsed.candidateName || 'Indeed-Bewerber';
    const finalEmail = cvData.email || parsed.email || null;
    const finalPhone = cvData.phone || parsed.phone || null;

    // 6. Get first pipeline stage for this agency
    const stages = await getStagesForAgency(supabase, agencyId);
    const firstStage = stages[0];
    if (!firstStage) {
      throw new Error('No pipeline stages configured');
    }

    // 7. Create candidate
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .insert({
        agency_id: agencyId,
        name: finalName,
        email: finalEmail,
        phone: finalPhone,
        source: 'indeed',
        current_stage_id: firstStage.id,
        resume_url: resumeUrl,
        location: cvData.location,
        experience_summary: cvData.experience_summary,
        last_employer: cvData.last_employer,
        indeed_job_title: parsed.jobTitle,
      })
      .select()
      .single();

    if (candidateError) throw candidateError;

    // 7b. Check blacklist
    const blacklistResult = await checkBlacklist(supabase, agencyId, finalEmail, finalPhone);
    if (blacklistResult.is_blacklisted) {
      await logActivity(supabase, {
        agency_id: agencyId,
        candidate_id: candidate.id,
        action: `Blacklist-Warnung (Indeed): Bewerber ${candidate.name} stimmt mit gesperrtem Bewerber ${blacklistResult.matching_candidate?.name} überein`,
        action_type: 'other',
        metadata: { source: 'indeed', blacklist_match: blacklistResult.matching_candidate },
      });
    }

    // 8. Log initial stage
    await supabase.from('candidate_stages').insert({
      candidate_id: candidate.id,
      stage_id: firstStage.id,
    });

    // 9. Log success
    await supabase.from('inbound_email_log').insert({
      agency_id: agencyId,
      from_address: from,
      to_address: to,
      subject,
      status: 'processed',
      candidate_id: candidate.id,
    });

    return NextResponse.json({ ok: true, candidate_id: candidate.id });
  } catch (err) {
    // Final fallback: log the error
    try {
      await supabase.from('inbound_email_log').insert({
        agency_id: agencyId,
        from_address: 'unknown',
        to_address: 'unknown',
        subject: null,
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
      });
    } catch {
      // best-effort log — ignore secondary failure
    }

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
