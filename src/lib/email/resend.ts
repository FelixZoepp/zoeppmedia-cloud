import { Resend } from 'resend';
import {
  inviteTemplate,
  welcomeTemplate,
  onboardingReminderTemplate,
  surveyNotificationTemplate,
} from './templates';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || '');
  }
  return _resend;
}
const FROM = 'Zoepp Media Cloud <noreply@zoeppmedia.de>';

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
