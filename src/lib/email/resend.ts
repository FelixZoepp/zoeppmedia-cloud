import { Resend } from 'resend';
import {
  inviteTemplate,
  welcomeTemplate,
  onboardingReminderTemplate,
  surveyNotificationTemplate,
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
