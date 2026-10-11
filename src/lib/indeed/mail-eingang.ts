/**
 * Indeed-Bewerbung per weitergeleiteter E-Mail (Resend Inbound → /api/webhooks/indeed-email).
 * - Inhalt + PDF über die Resend-Receiving-API laden (Full-Access-Key RESEND_RECEIVING_API_KEY nötig)
 * - Abruf fehlgeschlagen → KEIN Platzhalter-Bewerber, sondern Eintrag „abruf_fehler“ + Alarm; Nachholen per Job
 * - Ohne Telefon und ohne E-Mail → kein Bewerber, Eintrag „unvollstaendig“ + Alarm
 * - Stelle über den Jobtitel der Mail zuordnen, sonst Standard-Stelle
 * - WhatsApp-Einwilligung aus dem Hinweis in der Indeed-Anzeige (agencies.settings.indeed_whatsapp_hinweis)
 * - Doppelte Zustellung: über die Resend-Mail-ID (sourceRef) idempotent
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseIndeedEmail, extractAgencyIdFromAddress } from './parse-email';
import { extractTextFromPdf, extractCvData, type CvData } from './extract-cv';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { ingestApplication } from '@/lib/recruiting/ingest';
import { normalizePhoneE164 } from '@/lib/phone';
import { alarmAnAdmins } from '@/lib/ops/alarm';

type Anhang = { filename?: string; content_type?: string; content?: string };

export interface MailErgebnis {
  http: number;
  status: 'processed' | 'abruf_fehler' | 'unvollstaendig' | 'no_agency' | 'kein_job' | 'nachgeholt';
  candidateId?: string;
  fehler?: string;
}

const istPdf = (a: { content_type?: string; filename?: string }) => !!(a.content_type?.includes('pdf') || a.filename?.toLowerCase().endsWith('.pdf'));

/** Mailinhalt + PDF-Anhänge bei Resend nachladen */
async function ladeVonResend(emailId: string): Promise<{ ok: true; html: string; anhaenge: Anhang[]; roh: { html: string | null; text: string | null } } | { ok: false; status: number; text: string }> {
  const key = process.env.RESEND_RECEIVING_API_KEY || process.env.RESEND_API_KEY;
  if (!key) return { ok: false, status: 0, text: 'RESEND_RECEIVING_API_KEY fehlt' };
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return { ok: false, status: res.status, text: (await res.text()).slice(0, 300) };
  const full = await res.json();
  const anhaenge: Anhang[] = [];
  for (const att of full.attachments ?? []) {
    if (!istPdf(att) || !att.id) continue;
    try {
      const metaRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments/${att.id}`, { headers: { Authorization: `Bearer ${key}` } });
      if (!metaRes.ok) continue;
      const meta = await metaRes.json();
      if (!meta.download_url) continue;
      const fileRes = await fetch(meta.download_url);
      if (!fileRes.ok) continue;
      anhaenge.push({ filename: att.filename, content_type: att.content_type, content: Buffer.from(await fileRes.arrayBuffer()).toString('base64') });
    } catch {
      // einzelner Anhang fehlgeschlagen – Rest weiter
    }
  }
  return { ok: true, html: full.html || full.text || '', anhaenge, roh: { html: full.html ?? null, text: full.text ?? null } };
}

/** Passende Stelle: Jobtitel aus der Mail ↔ aktive Stellen (genau, dann enthält), sonst Standard-Stelle */
async function findeStelle(svc: SupabaseClient, agencyId: string, jobTitel: string | null): Promise<{ id: string } | null> {
  const { data: jobs } = await svc.from('jobs').select('id, title, is_default, status').eq('agency_id', agencyId);
  const liste = (jobs ?? []) as Array<{ id: string; title: string | null; is_default: boolean | null; status: string | null }>;
  const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/\(m\/w\/d\)|\(w\/m\/d\)|[^a-zäöüß0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (jobTitel) {
    const t = norm(jobTitel);
    const aktiv = liste.filter((j) => j.status === 'active');
    const treffer = aktiv.find((j) => norm(j.title) === t) ?? aktiv.find((j) => norm(j.title) && (t.includes(norm(j.title)) || norm(j.title).includes(t)));
    if (treffer) return { id: treffer.id };
  }
  const standard = liste.find((j) => j.is_default) ?? liste.find((j) => j.status === 'active');
  return standard ? { id: standard.id } : null;
}

export async function verarbeiteIndeedMail(svc: SupabaseClient, body: Record<string, unknown>, opts: { platzhalterId?: string | null } = {}): Promise<MailErgebnis> {
  const daten = body?.data as Record<string, unknown> | undefined;
  const payload = (daten && typeof daten === 'object' && (daten.to || daten.subject !== undefined) ? daten : body) as Record<string, unknown> & {
    headers?: Record<string, unknown>;
  };
  const joinAddr = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : (v ?? '').toString());
  const to = joinAddr(payload.to || payload.headers?.to);
  const from = joinAddr(payload.from || payload.headers?.from);
  const subject = (payload.subject || payload.headers?.subject || '').toString();
  let htmlBody = ((payload.html || payload.text || '') as string) ?? '';
  let anhaenge: Anhang[] = (payload.attachments as Anhang[] | undefined) ?? [];
  const emailId = payload.email_id as string | undefined;

  const log = (status: string, extra: Record<string, unknown> = {}) =>
    svc.from('inbound_email_log').insert({ agency_id: extra.agency_id ?? null, from_address: from, to_address: to, subject, status, raw_payload: body, ...extra });

  const agencyId = extractAgencyIdFromAddress(to);
  if (!agencyId) {
    await log('no_agency', { error_message: 'No agency ID in address tag' });
    return { http: 400, status: 'no_agency' };
  }
  const { data: agency } = await svc.from('agencies').select('id, name, settings').eq('id', agencyId).maybeSingle();
  const ag = agency as { id: string; name: string; settings: Record<string, unknown> | null } | null;
  if (!ag) {
    await log('no_agency', { error_message: `Agency ${agencyId} not found` });
    return { http: 404, status: 'no_agency' };
  }

  // Inhalt nachladen (Resend-Webhook enthält nur Metadaten)
  if (!htmlBody && emailId) {
    const r = await ladeVonResend(emailId);
    if (!r.ok) {
      const fehler = `Resend ${r.status}: ${r.text}`;
      if (!opts.platzhalterId) await log('abruf_fehler', { agency_id: agencyId, error_message: fehler });
      await alarmAnAdmins(svc, {
        titel: '🚨 Indeed-Bewerbungen kommen nicht an',
        text: `Die Cloud kann weitergeleitete Indeed-Mails nicht abrufen (${fehler.slice(0, 120)}). Bewerber werden NICHT angelegt, bis RESEND_RECEIVING_API_KEY (Full Access) gesetzt ist – danach werden sie automatisch nachgeholt.`,
        agencyId,
      });
      return { http: 200, status: 'abruf_fehler', fehler };
    }
    htmlBody = r.html;
    anhaenge = r.anhaenge;
    body.fetched_content = r.roh;
  }

  const parsed = parseIndeedEmail(htmlBody, subject);

  // PDF speichern + Lebenslauf auswerten
  let pfad: string | null = null;
  let cv: CvData = { full_name: null, email: null, phone: null, location: null, experience_summary: null, last_employer: null };
  const pdf = anhaenge.find(istPdf);
  if (pdf?.content) {
    const buf = Buffer.from(pdf.content, 'base64');
    try {
      const safeName = (parsed.candidateName || 'bewerber').replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_').slice(0, 50);
      const fileName = `${agencyId}/${Date.now()}-${safeName}.pdf`;
      const { error } = await svc.storage.from('candidate-resumes').upload(fileName, buf, { contentType: 'application/pdf' });
      if (!error) pfad = fileName;
    } catch {
      // ohne Lebenslauf weiter
    }
    try {
      const text = await extractTextFromPdf(buf);
      if (text.length > 20) cv = await extractCvData(text);
    } catch {
      // nur Maildaten
    }
  }

  const name = cv.full_name || parsed.candidateName || null;
  const email = cv.email || parsed.email || null;
  const telefon = cv.phone || parsed.phone || null;

  if (!telefon && !email) {
    await log('unvollstaendig', { agency_id: agencyId, error_message: 'Weder Telefonnummer noch E-Mail in Mail/Lebenslauf' });
    await alarmAnAdmins(svc, {
      titel: `⚠️ Indeed-Bewerbung ohne Kontaktdaten (${ag.name})`,
      text: `Eine Indeed-Bewerbung für ${ag.name} enthielt weder Telefonnummer noch E-Mail${name ? ` (${name})` : ''}. Bitte in Indeed nachsehen.`,
      agencyId,
    });
    return { http: 200, status: 'unvollstaendig' };
  }

  // Nachholen: vorhandenen Platzhalter-Bewerber ergänzen statt einen neuen anzulegen (keine automatische Nachricht)
  if (opts.platzhalterId) {
    const { error } = await svc
      .from('candidates')
      .update({
        name: name ?? 'Indeed-Bewerber',
        email,
        phone: telefon,
        phone_e164: normalizePhoneE164(telefon),
        location: cv.location || null,
        experience_summary: cv.experience_summary || null,
        last_employer: cv.last_employer || null,
        indeed_job_title: parsed.jobTitle || null,
      })
      .eq('id', opts.platzhalterId)
      .eq('agency_id', agencyId);
    if (error) throw new Error(`Platzhalter nicht ergänzt: ${error.message}`);
    await logActivity(svc, { agency_id: agencyId, candidate_id: opts.platzhalterId, action: 'Indeed-Bewerbung nachgeholt (Kontaktdaten ergänzt)', action_type: 'other', metadata: { source: 'indeed', email_id: emailId } }).catch(() => {});
    return { http: 200, status: 'nachgeholt', candidateId: opts.platzhalterId };
  }

  const stelle = await findeStelle(svc, agencyId, parsed.jobTitle ?? null);
  if (!stelle) {
    await log('kein_job', { agency_id: agencyId, error_message: 'Keine aktive Stelle für diese Agentur' });
    await alarmAnAdmins(svc, { titel: `⚠️ Keine aktive Stelle bei ${ag.name}`, text: 'Indeed-Bewerbung konnte keiner Stelle zugeordnet werden – bitte eine Stelle anlegen.', agencyId });
    return { http: 422, status: 'kein_job' };
  }

  const resumeSize = pdf?.content ? Math.ceil(pdf.content.length * 0.75) : 0;
  const hinweis = (ag.settings ?? {}).indeed_whatsapp_hinweis === true;
  const result = await ingestApplication(svc, {
    agencyId,
    jobId: stelle.id,
    firstName: (name ?? 'Indeed-Bewerber').split(' ')[0] || 'Indeed-Bewerber',
    lastName: (name ?? '').split(' ').slice(1).join(' ') || null,
    phone: telefon,
    email,
    source: 'indeed',
    sourceRef: emailId ? `resend:${emailId}` : null,
    campaign: parsed.jobTitle ? { stellentitel: parsed.jobTitle } : null,
    consentWhatsapp: hinweis,
    consentSource: hinweis ? 'indeed_anzeige_hinweis' : null,
    resume: pfad ? { storagePath: pfad, mime: 'application/pdf', size: resumeSize } : null,
  });

  if (result.candidateCreated) {
    const bl = await checkBlacklist(svc, agencyId, email, telefon);
    if (bl.is_blacklisted) {
      await logActivity(svc, {
        agency_id: agencyId,
        candidate_id: result.candidateId,
        action: `Blacklist-Warnung (Indeed): Bewerber ${name ?? ''} stimmt mit gesperrtem Bewerber ${bl.matching_candidate?.name} überein`,
        action_type: 'other',
        metadata: { source: 'indeed', blacklist_match: bl.matching_candidate },
      });
    }
    await svc
      .from('candidates')
      .update({ location: cv.location || null, experience_summary: cv.experience_summary || null, last_employer: cv.last_employer || null, indeed_job_title: parsed.jobTitle || null })
      .eq('id', result.candidateId)
      .eq('agency_id', agencyId);
  }

  await log('processed', { agency_id: agencyId, candidate_id: result.candidateId });
  return { http: 200, status: 'processed', candidateId: result.candidateId };
}

/**
 * Job indeed.nachholen: Mails, deren Abruf fehlgeschlagen ist (oder die früher als Platzhalter ohne Kontaktdaten
 * angelegt wurden), erneut verarbeiten. Läuft nur, wenn der Abruf wieder funktioniert. Schreibt niemanden an.
 */
export async function holeIndeedMailsNach(svc: SupabaseClient, tage = 30): Promise<{ geprueft: number; nachgeholt: number; neu: number; fehler: number }> {
  const seit = new Date(Date.now() - tage * 864e5).toISOString();
  const { data } = await svc
    .from('inbound_email_log')
    .select('id, status, candidate_id, raw_payload')
    .in('status', ['abruf_fehler', 'processed'])
    .gte('created_at', seit)
    .order('created_at')
    .limit(200);
  let nachgeholt = 0;
  let neu = 0;
  let fehler = 0;
  let geprueft = 0;
  for (const row of (data ?? []) as Array<{ id: string; status: string; candidate_id: string | null; raw_payload: Record<string, unknown> | null }>) {
    const roh = row.raw_payload ?? {};
    const debug = roh.fetch_debug as { ok?: boolean } | undefined;
    const istPlatzhalter = row.status === 'processed' && debug && debug.ok === false && row.candidate_id;
    if (row.status !== 'abruf_fehler' && !istPlatzhalter) continue;
    if (istPlatzhalter) {
      const { data: c } = await svc.from('candidates').select('phone_e164, email').eq('id', row.candidate_id!).maybeSingle();
      if (!c || (c as { phone_e164: string | null }).phone_e164 || (c as { email: string | null }).email) continue;
    }
    geprueft++;
    const kopie = JSON.parse(JSON.stringify(roh)) as Record<string, unknown>;
    delete kopie.fetch_debug;
    try {
      const r = await verarbeiteIndeedMail(svc, kopie, { platzhalterId: istPlatzhalter ? row.candidate_id : null });
      if (r.status === 'abruf_fehler') return { geprueft, nachgeholt, neu, fehler: fehler + 1 }; // Schlüssel noch nicht da → abbrechen
      if (r.status === 'nachgeholt') nachgeholt++;
      if (r.status === 'processed') neu++;
      await svc.from('inbound_email_log').update({ status: r.status === 'nachgeholt' ? 'nachgeholt' : row.status === 'abruf_fehler' ? 'nachgeholt' : row.status }).eq('id', row.id);
    } catch {
      fehler++;
    }
  }
  return { geprueft, nachgeholt, neu, fehler };
}
