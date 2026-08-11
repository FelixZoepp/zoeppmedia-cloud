import { Resend } from 'resend';
import {
  inviteTemplate,
  welcomeTemplate,
  onboardingReminderTemplate,
  surveyNotificationTemplate,
} from './templates';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Zoepp Media Cloud <noreply@zoeppmedia.de>';

export async function sendInviteEmail(
  to: string,
  agencyName: string,
  registerUrl: string,
  expiresAt: string,
) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Einladung: ${agencyName} — Zoepp Media Cloud`,
    html: inviteTemplate(agencyName, registerUrl, expiresAt),
  });
}

export async function sendWelcomeEmail(to: string, name: string, loginUrl: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Willkommen bei Zoepp Media Cloud!',
    html: welcomeTemplate(name, loginUrl),
  });
}

export async function sendOnboardingReminder(to: string, name: string, onboardingUrl: string) {
  return resend.emails.send({
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
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Feedback-Check: ${surveyTitle}`,
    html: surveyNotificationTemplate(name, surveyTitle, portalUrl),
  });
}
