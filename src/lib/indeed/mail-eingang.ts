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
import { speichereIndeedBeleg } from '@/lib/zuordnung/belege';
import { alarmAnAdmins } from '@/lib/ops/alarm';
import { meldeNeuenBewerber } from '@/lib/notifications/neuer-bewerber';

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
export async function findeStelle(svc: SupabaseClient, agencyId: string, jobTitel: string | null): Promise<{ id: string } | null> {
  const { data: jobs } = await svc.from('jobs').select('id, title, is_default, status').eq('agency_id', agencyId);
  const liste = (jobs ?? []) as Array<{ id: string; title: string | null; is_default: boolean | null; status: string | null }>;
  const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/\(m\/w\/d\)|\(w\/m\/d\)|[^a-zäöüß0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (jobTitel) {
    const t = norm(jobTitel);
    const aktiv = liste.filter((j) => j.status === 'active');
    const treffer = aktiv.find((j) => norm(j.title) === t) ?? aktiv.find((j) => norm(j.title) && (t.includes(norm(j.title)) || norm(j.title).includes(t)));
    if (treffer) return { id: treffer.id };
  }
  const aktive = liste.filter((j) => j.status === 'active');
  const standard = aktive.find((j) => j.is_default) ?? aktive[0];
  return standard ? { id: standard.id } : null;
}

export async function verarbeiteIndeedMail(svc: SupabaseClient, body: Record<string, unknown>, opts: { platzhalterId?: string | null; nachholen?: boolean } = {}): Promise<MailErgebnis> {
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
  const rohId = payload.email_id as string | undefined;
  // Nur echte Resend-IDs (UUID) – sonst ließe sich der API-Pfad manipulieren
  const emailId = rohId && /^[0-9a-f-]{36}$/i.test(rohId) ? rohId : undefined;

  // Beim Nachholen keine neuen Log-Zeilen (die Ursprungszeile wird vom Aufrufer aktualisiert)
  const log = async (status: string, extra: Record<string, unknown> = {}) => {
    if (opts.nachholen) return;
    await svc.from('inbound_email_log').insert({ agency_id: extra.agency_id ?? null, from_address: from, to_address: to, subject, status, raw_payload: body, ...extra });
  };

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
      await log('abruf_fehler', { agency_id: agencyId, error_message: fehler });
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
  // Lebensläufe über 8 MB nicht verarbeiten (Speicher/Laufzeit)
  if (pdf?.content && pdf.content.length * 0.75 <= 8 * 1024 * 1024) {
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

  // Beleg aus dem Indeed-Konto dieses Kunden (zweite Quelle für Manatal-Bewerber) – wartende Prüfstand-Einträge sofort neu prüfen
  if (!opts.nachholen) {
    await speichereIndeedBeleg(svc, { agencyId, name: parsed.candidateName || name, email: parsed.email || email, phone: parsed.phone || telefon, stellentitel: parsed.jobTitle ?? null, emailId: emailId ?? null });
    await svc.from('bewerber_pruefstand').update({ naechster_versuch: new Date().toISOString() }).eq('quelle', 'manatal').eq('agency_vorschlag', agencyId).in('status', ['wartet', 'offen']);
  }

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
  // Indeed-Anzeigen enthalten den Hinweis auf WhatsApp-Kontakt (Standard an; pro Kunde mit settings.indeed_whatsapp_hinweis = false abschaltbar)
  const hinweis = (ag.settings ?? {}).indeed_whatsapp_hinweis !== false;
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
    ohneAutomatik: !!opts.nachholen,
    nachweis: { quelle: 'indeed_mail', pruefungen: [`Indeed-Mail an die Kunden-Adresse (${to.slice(0, 80)})`], email_id: emailId ?? null, zeit: new Date().toISOString() },
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
    if (!opts.nachholen) {
      await meldeNeuenBewerber(svc, agencyId, { candidateId: result.candidateId, name, phone: telefon, quelle: 'Indeed' }).catch((err) =>
        console.error('[indeed] Bewerber-Push fehlgeschlagen:', err),
      );
    }
  }

  await log('processed', { agency_id: agencyId, candidate_id: result.candidateId });
  return { http: 200, status: 'processed', candidateId: result.candidateId };
}

/**
 * Job indeed.nachholen: Mails, deren Abruf fehlgeschlagen ist (oder die früher als Platzhalter ohne Kontaktdaten
 * angelegt wurden), erneut verarbeiten. Läuft nur, wenn der Abruf wieder funktioniert.
 * Schreibt niemanden an (kein Bot, keine Automationen) – der Innendienst bekommt nur einen Anruf-Auftrag.
 * Erledigt = nur bei Erfolg; nach 5 Versuchen „aufgegeben“.
 */
export async function holeIndeedMailsNach(svc: SupabaseClient, tage = 90): Promise<{ geprueft: number; nachgeholt: number; neu: number; fehler: number }> {
  const seit = new Date(Date.now() - tage * 864e5).toISOString();
  // 1. Offene Abruf-Fehler
  const { data: offen } = await svc
    .from('inbound_email_log')
    .select('id, candidate_id, raw_payload, versuche')
    .eq('status', 'abruf_fehler')
    .gte('created_at', seit)
    .order('created_at')
    .limit(50);
  // 2. Alte Platzhalter (verarbeitet, aber Abruf war fehlgeschlagen und Bewerber hat keine Kontaktdaten)
  const { data: kandidaten } = await svc
    .from('inbound_email_log')
    .select('id, candidate_id, raw_payload, versuche')
    .eq('status', 'processed')
    .not('candidate_id', 'is', null)
    .eq('raw_payload->fetch_debug->>ok', 'false')
    .gte('created_at', seit)
    .order('created_at')
    .limit(50);
  const zeilen = [
    ...((offen ?? []) as Array<{ id: string; candidate_id: string | null; raw_payload: Record<string, unknown> | null; versuche: number }>).map((r) => ({ ...r, platzhalter: false })),
    ...((kandidaten ?? []) as Array<{ id: string; candidate_id: string | null; raw_payload: Record<string, unknown> | null; versuche: number }>).map((r) => ({ ...r, platzhalter: true })),
  ];
  let nachgeholt = 0;
  let neu = 0;
  let fehler = 0;
  let geprueft = 0;
  for (const row of zeilen) {
    if (row.platzhalter) {
      const { data: c } = await svc.from('candidates').select('phone_e164, email').eq('id', row.candidate_id!).maybeSingle();
      const k = c as { phone_e164: string | null; email: string | null } | null;
      if (!k || k.phone_e164 || k.email) {
        await svc.from('inbound_email_log').update({ status: 'nachgeholt' }).eq('id', row.id);
        continue;
      }
    }
    geprueft++;
    const kopie = JSON.parse(JSON.stringify(row.raw_payload ?? {})) as Record<string, unknown>;
    delete kopie.fetch_debug;
    const versuche = (row.versuche ?? 0) + 1;
    try {
      const r = await verarbeiteIndeedMail(svc, kopie, { platzhalterId: row.platzhalter ? row.candidate_id : null, nachholen: true });
      if (r.status === 'abruf_fehler') {
        // Schlüssel fehlt noch → abbrechen, nichts als Versuch zählen
        return { geprueft, nachgeholt, neu, fehler: fehler + 1 };
      }
      const erfolg = r.status === 'nachgeholt' || r.status === 'processed';
      if (r.status === 'nachgeholt') nachgeholt++;
      if (r.status === 'processed') neu++;
      await svc
        .from('inbound_email_log')
        .update({
          status: erfolg ? 'nachgeholt' : versuche >= 5 ? 'aufgegeben' : row.platzhalter ? 'processed' : 'abruf_fehler',
          versuche,
          error_message: erfolg ? null : `Nachholen: ${r.status}`,
          ...(r.candidateId && !row.platzhalter ? { candidate_id: r.candidateId } : {}),
        })
        .eq('id', row.id);
    } catch (e) {
      fehler++;
      await svc
        .from('inbound_email_log')
        .update({ versuche, status: versuche >= 5 ? 'aufgegeben' : row.platzhalter ? 'processed' : 'abruf_fehler', error_message: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
        .eq('id', row.id);
    }
  }
  return { geprueft, nachgeholt, neu, fehler };
}
