// src/lib/dsgvo/export.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface DsgvoExport {
  exportedAt: string;
  candidate: Record<string, unknown>;
  consent: {
    optIn: boolean;
    version: number | null;
    text: string | null;
    at: string | null;
    source: string | null;
  };
  applications: Array<Record<string, unknown>>;
  answers: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
}

/**
 * Builds a GDPR data export for a candidate, strictly agency-scoped.
 * Returns null if the candidate does not exist or belongs to a different agency.
 */
export async function buildDsgvoExport(
  svc: SupabaseClient,
  agencyId: string,
  candidateId: string
): Promise<DsgvoExport | null> {
  // 1. Kandidat laden — agency-gescoped
  const { data: candidate } = await svc
    .from('candidates')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('id', candidateId)
    .maybeSingle();

  if (!candidate) return null;

  const candidateRow = candidate as Record<string, unknown>;

  // 2. Applications — agency-gescoped
  const { data: applications } = await svc
    .from('applications')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);

  const appRows = (applications ?? []) as Array<Record<string, unknown>>;
  const appIds = appRows.map((a) => a.id as string);

  // 3. Answers via application_ids
  let answerRows: Array<Record<string, unknown>> = [];
  if (appIds.length > 0) {
    const { data: answers } = await svc
      .from('application_answers')
      .select('*')
      .in('application_id', appIds);
    answerRows = (answers ?? []) as Array<Record<string, unknown>>;
  }

  // 4. Conversations — agency-gescoped
  const { data: conversations } = await svc
    .from('conversations')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);

  const convIds = ((conversations ?? []) as Array<{ id: string }>).map((c) => c.id);

  // 5. Messages — agency-gescoped via conversation_ids
  let messageRows: Array<Record<string, unknown>> = [];
  if (convIds.length > 0) {
    const { data: messages } = await svc
      .from('messages')
      .select('direction, created_at, body')
      .eq('agency_id', agencyId)
      .in('conversation_id', convIds);
    messageRows = (messages ?? []) as Array<Record<string, unknown>>;
  }

  // 6. Notes — via candidate_id
  const { data: notes } = await svc
    .from('notes')
    .select('*')
    .eq('candidate_id', candidateId);

  const noteRows = (notes ?? []) as Array<Record<string, unknown>>;

  return {
    exportedAt: new Date().toISOString(),
    candidate: candidateRow,
    consent: {
      optIn: Boolean(candidateRow.whatsapp_opt_in),
      version: (candidateRow.consent_version as number | null) ?? null,
      text: (candidateRow.consent_text as string | null) ?? null,
      at: (candidateRow.consent_at as string | null) ?? null,
      source: (candidateRow.consent_source as string | null) ?? null,
    },
    applications: appRows,
    answers: answerRows,
    messages: messageRows,
    notes: noteRows,
  };
}

// ---------------------------------------------------------------------------
// WinAnsi-safe string filter
// Emojis und andere Zeichen außerhalb des WinAnsi-Zeichensatzes (U+0000–U+00FF,
// abzüglich Steuerzeichen) werden durch '?' ersetzt. Umlaute ä/ö/ü/ß (U+00E4,
// U+00F6, U+00FC, U+00DF) liegen im WinAnsi-Bereich und bleiben erhalten.
// ---------------------------------------------------------------------------
function toWinAnsi(text: string): string {
  return text.replace(/[^\u0020-\u00FF]/g, '?');
}

function safeStr(value: unknown): string {
  if (value === null || value === undefined) return '–';
  return toWinAnsi(String(value));
}

/**
 * Renders a GDPR data export as a PDF using pdf-lib.
 * Uses StandardFonts.Helvetica (WinAnsi encoding).
 * Non-WinAnsi characters (e.g. emojis from WhatsApp) are replaced with '?'.
 * Umlauts (ä/ö/ü/ß) are preserved.
 */
export async function renderDsgvoPdf(data: DsgvoExport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 50;
  const marginRight = 50;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const lineHeight = 16;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 60;

  function ensureSpace(needed = lineHeight) {
    if (y < 60 + needed) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 60;
    }
  }

  function drawTitle(text: string) {
    ensureSpace(28);
    page.drawText(toWinAnsi(text), {
      x: marginLeft,
      y,
      font: boldFont,
      size: 16,
      color: rgb(0, 0, 0),
    });
    y -= 28;
  }

  function drawSectionHeader(text: string) {
    ensureSpace(24);
    page.drawText(toWinAnsi(text), {
      x: marginLeft,
      y,
      font: boldFont,
      size: 12,
      color: rgb(0.1, 0.1, 0.5),
    });
    y -= 20;
  }

  function drawLine(label: string, value: string) {
    ensureSpace(lineHeight);
    const labelStr = toWinAnsi(label + ': ');
    const valueStr = safeStr(value);
    // Truncate to fit page width (rough estimate: ~5.5 px per char at size 10)
    const maxValueChars = Math.floor((contentWidth - labelStr.length * 6) / 5.5);
    const truncated =
      valueStr.length > maxValueChars
        ? valueStr.slice(0, maxValueChars) + '…'
        : valueStr;
    page.drawText(labelStr, {
      x: marginLeft,
      y,
      font: boldFont,
      size: 10,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(toWinAnsi(truncated), {
      x: marginLeft + labelStr.length * 6,
      y,
      font,
      size: 10,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  }

  function drawText(text: string) {
    ensureSpace(lineHeight);
    page.drawText(toWinAnsi(text), {
      x: marginLeft,
      y,
      font,
      size: 10,
      color: rgb(0, 0, 0),
      maxWidth: contentWidth,
    });
    y -= lineHeight;
  }

  function drawSeparator() {
    ensureSpace(8);
    page.drawLine({
      start: { x: marginLeft, y: y + 4 },
      end: { x: pageWidth - marginRight, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 8;
  }

  // --- Titel ---
  drawTitle('Datenauskunft (Art. 15 DSGVO)');
  drawText(`Erstellt am: ${safeStr(data.exportedAt)}`);
  y -= 8;
  drawSeparator();

  // --- Stammdaten ---
  drawSectionHeader('Stammdaten');
  for (const [key, value] of Object.entries(data.candidate)) {
    if (key === 'agency_id') continue; // interne ID nicht exportieren
    drawLine(key, String(value ?? ''));
  }
  y -= 4;

  // --- Consent ---
  drawSectionHeader('Einwilligung (Consent)');
  drawLine('Opt-in', data.consent.optIn ? 'Ja' : 'Nein');
  drawLine('Version', String(data.consent.version ?? '–'));
  drawLine('Text', data.consent.text ?? '–');
  drawLine('Zeitpunkt', data.consent.at ?? '–');
  drawLine('Quelle', data.consent.source ?? '–');
  y -= 4;

  // --- Bewerbungen ---
  drawSectionHeader(`Bewerbungen (${data.applications.length})`);
  if (data.applications.length === 0) {
    drawText('Keine Bewerbungen vorhanden.');
  } else {
    for (const app of data.applications) {
      drawLine('Status', safeStr(app.status));
      drawLine('Erstellt', safeStr(app.created_at));
      if (app.job_title) drawLine('Stelle', safeStr(app.job_title));
      y -= 4;
    }
  }

  // --- Antworten ---
  drawSectionHeader(`Antworten (${data.answers.length})`);
  if (data.answers.length === 0) {
    drawText('Keine Antworten vorhanden.');
  } else {
    for (const ans of data.answers) {
      drawLine('Frage', safeStr(ans.question_text ?? ans.question_id ?? ''));
      drawLine('Antwort', safeStr(ans.answer_raw ?? ans.answer_normalized ?? ''));
      y -= 4;
    }
  }

  // --- Nachrichten ---
  drawSectionHeader(`Nachrichten (${data.messages.length})`);
  if (data.messages.length === 0) {
    drawText('Keine Nachrichten vorhanden.');
  } else {
    for (const msg of data.messages) {
      drawLine('Richtung', safeStr(msg.direction));
      drawLine('Zeitpunkt', safeStr(msg.created_at));
      drawLine('Inhalt', safeStr(msg.body));
      y -= 4;
    }
  }

  // --- Notizen ---
  drawSectionHeader(`Notizen (${data.notes.length})`);
  if (data.notes.length === 0) {
    drawText('Keine Notizen vorhanden.');
  } else {
    for (const note of data.notes) {
      drawLine('Text', safeStr(note.text));
      if (note.created_at) drawLine('Erstellt', safeStr(note.created_at));
      y -= 4;
    }
  }

  return doc.save();
}
