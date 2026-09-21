import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseIndeedEmail, extractAgencyIdFromAddress } from '@/lib/indeed/parse-email';
import { extractTextFromPdf, extractCvData, type CvData } from '@/lib/indeed/extract-cv';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { ingestApplication } from '@/lib/recruiting/ingest';

export async function POST(request: NextRequest) {
  // Shared-Secret-Prüfung: aktiv sobald INDEED_WEBHOOK_SECRET gesetzt ist.
  // Der E-Mail-Forwarder muss das Secret als Header x-webhook-secret oder ?secret= mitschicken.
  const webhookSecret = process.env.INDEED_WEBHOOK_SECRET;
  if (webhookSecret) {
    const provided =
      request.headers.get('x-webhook-secret') ||
      request.nextUrl.searchParams.get('secret');
    if (provided !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  let agencyId: string | null = null;

  try {
    const body = await request.json();
    // Resend "email.received" webhooks verschachteln die Felder unter `data`
    // und liefern `to` als Array. Beide Formate (flach + Resend) unterstützen.
    const payload = body?.data && typeof body.data === 'object' && (body.data.to || body.data.subject !== undefined)
      ? body.data
      : body;
    const joinAddr = (v: unknown): string => Array.isArray(v) ? v.join(', ') : (v ?? '').toString();
    const to = joinAddr(payload.to || payload.headers?.to);
    const from = joinAddr(payload.from || payload.headers?.from);
    const subject = (payload.subject || payload.headers?.subject || '').toString();
    let htmlBody = payload.html || payload.text || '';
    let attachments: { filename?: string; content_type?: string; content?: string }[] = payload.attachments || [];

    // Resend Inbound: Der Webhook enthält nur Metadaten (kein html/text, keine
    // Anhang-Inhalte). Vollständigen Inhalt per Receiving-API nachladen.
    const resendKey = process.env.RESEND_API_KEY;
    const emailId = payload.email_id as string | undefined;
    if (!htmlBody && emailId && resendKey) {
      try {
        const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { Authorization: `Bearer ${resendKey}` },
        });
        if (body && typeof body === 'object') {
          body.fetch_debug = { status: res.status, ok: res.ok, snippet: res.ok ? null : (await res.clone().text()).slice(0, 500) };
        }
        if (res.ok) {
          const full = await res.json();
          htmlBody = full.html || full.text || '';
          // Für spätere Analyse mit ins raw_payload-Log aufnehmen
          if (body && typeof body === 'object') {
            body.fetched_content = { html: full.html ?? null, text: full.text ?? null };
          }

          // PDF-Anhänge: Metadaten → Download-URL holen → Inhalt als Base64 laden
          const fetchedAttachments: { filename?: string; content_type?: string; content?: string }[] = [];
          for (const att of full.attachments ?? []) {
            const isPdf = att.content_type?.includes('pdf') || att.filename?.toLowerCase().endsWith('.pdf');
            if (!isPdf || !att.id) continue;
            try {
              const metaRes = await fetch(
                `https://api.resend.com/emails/receiving/${emailId}/attachments/${att.id}`,
                { headers: { Authorization: `Bearer ${resendKey}` } }
              );
              if (!metaRes.ok) continue;
              const meta = await metaRes.json();
              if (!meta.download_url) continue;
              const fileRes = await fetch(meta.download_url);
              if (!fileRes.ok) continue;
              const buf = Buffer.from(await fileRes.arrayBuffer());
              fetchedAttachments.push({
                filename: att.filename,
                content_type: att.content_type,
                content: buf.toString('base64'),
              });
            } catch {
              // Einzelner Anhang fehlgeschlagen — restliche weiter verarbeiten
            }
          }
          if (fetchedAttachments.length > 0) attachments = fetchedAttachments;
        }
      } catch {
        // Nachladen fehlgeschlagen — mit Webhook-Metadaten weitermachen
      }
    }

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
    // storagePath tracks the REAL path used when uploading — passed to ingestApplication
    // so the documents table references the actual file in storage.
    let uploadedStoragePath: string | null = null;
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
          // Retain the actual storage path for ingestApplication resume reference
          uploadedStoragePath = fileName;
        }
      } catch {
        // Storage failed — continue without resume
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

    // 6. Default-Job der Agentur finden
    let defaultJob: { id: string } | null = null;
    const { data: markedDefault } = await supabase
      .from('jobs')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();
    defaultJob = markedDefault;

    if (!defaultJob) {
      const { data: anyJob } = await supabase
        .from('jobs')
        .select('id')
        .eq('agency_id', agencyId!)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (!anyJob) {
        return NextResponse.json({ error: 'Kein aktiver Job für diese Agentur' }, { status: 422 });
      }
      defaultJob = anyJob;
    }

    // 7. Ingest application via central ingestApplication()
    // resume references the REAL uploaded storage path (not a fabricated one)
    let resumeSize = 0;
    const pdfBuffer = attachments.find(a =>
      a.content_type?.includes('pdf') || a.filename?.toLowerCase().endsWith('.pdf')
    )?.content;
    if (pdfBuffer && typeof pdfBuffer === 'string') {
      // Base64 string: length / 4 * 3 (approximately)
      resumeSize = Math.ceil(pdfBuffer.length * 0.75);
    }
    const resume = uploadedStoragePath
      ? { storagePath: uploadedStoragePath, mime: 'application/pdf', size: resumeSize }
      : null;

    const result = await ingestApplication(supabase, {
      agencyId: agencyId!,
      jobId: defaultJob.id,
      firstName: finalName.split(' ')[0] || 'Indeed-Bewerber',
      lastName: finalName.split(' ').slice(1).join(' ') || null,
      phone: finalPhone,
      email: finalEmail,
      source: 'indeed',
      resume,
    });

    // 7b. Blacklist-Check (nur bei neu angelegtem Kandidaten)
    if (result.candidateCreated) {
      const blacklistResult = await checkBlacklist(supabase, agencyId!, finalEmail, finalPhone);
      if (blacklistResult.is_blacklisted) {
        await logActivity(supabase, {
          agency_id: agencyId!,
          candidate_id: result.candidateId,
          action: `Blacklist-Warnung (Indeed): Bewerber ${finalName} stimmt mit gesperrtem Bewerber ${blacklistResult.matching_candidate?.name} überein`,
          action_type: 'other',
          metadata: { source: 'indeed', blacklist_match: blacklistResult.matching_candidate },
        });
      }

      // 7c. Enrichment: CV-Felder auf candidates schreiben (nur bei neu angelegtem Kandidaten)
      await supabase
        .from('candidates')
        .update({
          location: cvData.location || null,
          experience_summary: cvData.experience_summary || null,
          last_employer: cvData.last_employer || null,
          indeed_job_title: parsed.jobTitle || null,
        })
        .eq('id', result.candidateId)
        .eq('agency_id', agencyId!);
    }

    // 8. Log success (inkl. raw_payload zur Analyse des Indeed-Mail-Formats)
    await supabase.from('inbound_email_log').insert({
      agency_id: agencyId,
      from_address: from,
      to_address: to,
      subject,
      status: 'processed',
      candidate_id: result.candidateId,
      raw_payload: body,
    });

    return NextResponse.json({ ok: true, candidate_id: result.candidateId });
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
