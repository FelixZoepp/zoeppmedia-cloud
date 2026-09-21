import { Resend } from 'resend';
import {
  inviteTemplate,
  welcomeTemplate,
  onboardingReminderTemplate,
  surveyNotificationTemplate,
  appointmentConfirmationTemplate,
  appointmentUpdateTemplate,
} from './templates';
import { reportTemplate } from './report-template';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || '');
  }
  return _resend;
}
const FROM = 'Zoepp Media Cloud <noreply@zoepp-gruppe.de>';

export async function sendInviteEmail(
  to: string,
  agencyName: string,
  registerUrl: string,
  expiresAt: string,
) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Einladung: ${agencyName} — Zoepp Media Cloud`,
    html: inviteTemplate(agencyName, registerUrl, expiresAt),
  });
}

export async function sendWelcomeEmail(to: string, name: string, loginUrl: string) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: 'Willkommen bei Zoepp Media Cloud!',
    html: welcomeTemplate(name, loginUrl),
  });
}

export async function sendOnboardingReminder(to: string, name: string, onboardingUrl: string) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: 'Erinnerung: Onboarding abschließen',
    html: onboardingReminderTemplate(name, onboardingUrl),
  });
}

export async function sendSurveyNotification(
  to: string,
  name: string,
  surveyTitle: string,
  portalUrl: string,
) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Feedback-Check: ${surveyTitle}`,
    html: surveyNotificationTemplate(name, surveyTitle, portalUrl),
  });
}

function formatBerlin(scheduledAt: Date): { dateStr: string; timeStr: string } {
  return {
    dateStr: scheduledAt.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Berlin',
    }),
    timeStr: scheduledAt.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }),
  };
}

function icsAttachment(ics: string, method: 'REQUEST' | 'CANCEL') {
  return [
    {
      filename: 'termin.ics',
      content: Buffer.from(ics, 'utf-8'),
      contentType: `text/calendar; method=${method}; charset=utf-8`,
    },
  ];
}

export async function sendAppointmentConfirmationEmail(
  to: string,
  candidateName: string,
  typeLabel: string,
  scheduledAt: Date,
  agencyName: string,
  notes: string | null,
  ics?: string,
) {
  const { dateStr, timeStr } = formatBerlin(scheduledAt);
  return getResend().emails.send({
    from: `${agencyName} via Zoepp Media Cloud <noreply@zoepp-gruppe.de>`,
    to,
    subject: `Terminbestätigung: ${typeLabel} am ${dateStr}`,
    html: appointmentConfirmationTemplate(candidateName, typeLabel, dateStr, timeStr, agencyName, notes),
    attachments: ics ? icsAttachment(ics, 'REQUEST') : undefined,
  });
}

export async function sendAppointmentUpdateEmail(
  to: string,
  candidateName: string,
  typeLabel: string,
  scheduledAt: Date,
  agencyName: string,
  notes: string | null,
  kind: 'verschoben' | 'abgesagt',
  ics?: string,
) {
  const { dateStr, timeStr } = formatBerlin(scheduledAt);
  const subject =
    kind === 'verschoben'
      ? `Terminänderung: ${typeLabel} jetzt am ${dateStr}`
      : `Terminabsage: ${typeLabel} am ${dateStr}`;
  return getResend().emails.send({
    from: `${agencyName} via Zoepp Media Cloud <noreply@zoepp-gruppe.de>`,
    to,
    subject,
    html: appointmentUpdateTemplate(candidateName, typeLabel, dateStr, timeStr, agencyName, notes, kind),
    attachments: ics ? icsAttachment(ics, kind === 'abgesagt' ? 'CANCEL' : 'REQUEST') : undefined,
  });
}

/** Kalender-Einladung an den Kunden (Agentur) — Termin landet sofort im Kalender */
export async function sendAgencyCalendarInvite(
  to: string,
  subject: string,
  bodyHtml: string,
  ics: string,
  method: 'REQUEST' | 'CANCEL' = 'REQUEST',
) {
  return getResend().emails.send({
    from: 'Zoepp Media Cloud <noreply@zoepp-gruppe.de>',
    to,
    subject,
    html: bodyHtml,
    attachments: icsAttachment(ics, method),
  });
}

export async function sendWeeklyReportEmail(to: string, kw: number, html: string) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Dein Wochenbericht — KW ${kw}`,
    html,
  });
}

export async function sendReportEmail(
  to: string,
  typ: 'tag_7' | 'tag_14',
  daten: Record<string, unknown>,
  agencyName: string,
  dashboardUrl: string,
) {
  const label = typ === 'tag_7' ? 'Tag-7' : 'Tag-14';
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `${label} Report — ${agencyName}`,
    html: reportTemplate(typ, daten, agencyName, dashboardUrl),
  });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function sendOptInFallbackEmail(to: string, firstName: string, applyUrl: string) {
  const safeFirstName = escapeHtml(firstName);
  const safeApplyUrl = escapeHtml(applyUrl);
  return getResend().emails.send({
    from: FROM,
    to,
    // subject is plain-text — no HTML escaping needed
    subject: 'Deine Bewerbung — ein Schritt fehlt noch',
    html: `<p>Hallo ${safeFirstName},</p><p>danke für deine Bewerbung! Damit wir dich schnell erreichen können, bestätige bitte kurz deine Telefonnummer und die Kontaktaufnahme über unser Formular:</p><p><a href="${safeApplyUrl}">${safeApplyUrl}</a></p><p>Viele Grüße<br/>Dein Recruiting-Team</p>`,
  });
}
