export function inviteTemplate(agencyName: string, registerUrl: string, expiresAt: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
      <p style="margin:0;font-size:13px;color:#888;">Bewerber-Management für D2D-Agenturen</p>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Du wurdest eingeladen!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
        <strong>${agencyName}</strong> wurde für Zoepp Media Cloud freigeschaltet. Erstelle jetzt deinen Account und starte mit dem Bewerber-Management.
      </p>
      <a href="${registerUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Account erstellen
      </a>
      <p style="font-size:13px;color:#999;margin:24px 0 0;">
        Dieser Link ist gültig bis ${expiresAt}. Falls er abgelaufen ist, bitte deinen Ansprechpartner um einen neuen.
      </p>
    </div>
  </div>
</body></html>`;
}

export function welcomeTemplate(name: string, loginUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Willkommen, ${name}!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;">
        Dein Account ist eingerichtet. Deine nächsten Schritte:
      </p>
      <ol style="font-size:15px;color:#444;line-height:1.8;margin:0 0 24px;padding-left:20px;">
        <li>Onboarding-Formular ausfüllen</li>
        <li>Masterclass-Videos anschauen</li>
        <li>Meta-Zugang einrichten</li>
      </ol>
      <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Zum Dashboard
      </a>
    </div>
  </div>
</body></html>`;
}

export function onboardingReminderTemplate(name: string, onboardingUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Onboarding nicht vergessen!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
        Hallo ${name}, dein Onboarding ist noch nicht abgeschlossen. Fülle es jetzt aus, damit wir mit deiner Kampagne starten können.
      </p>
      <a href="${onboardingUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Onboarding fortsetzen
      </a>
    </div>
  </div>
</body></html>`;
}

export function appointmentConfirmationTemplate(
  candidateName: string,
  typeLabel: string,
  dateStr: string,
  timeStr: string,
  agencyName: string,
  notes: string | null,
): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">${agencyName}</h2>
      <p style="margin:0;font-size:13px;color:#888;">Terminbestätigung</p>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Dein Termin ist bestätigt!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
        Hallo ${candidateName}, dein <strong>${typeLabel}</strong> bei <strong>${agencyName}</strong> steht fest:
      </p>
      <div style="background:#f5f5f7;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:15px;color:#111;"><strong>📅 ${dateStr}</strong></p>
        <p style="margin:0;font-size:15px;color:#111;"><strong>🕐 ${timeStr} Uhr</strong></p>
        ${notes ? `<p style="margin:12px 0 0;font-size:14px;color:#444;">${notes}</p>` : ''}
      </div>
      <p style="font-size:14px;color:#666;line-height:1.6;margin:0;">
        Bitte sei pünktlich. Falls du den Termin nicht wahrnehmen kannst, gib bitte rechtzeitig Bescheid.
      </p>
    </div>
  </div>
</body></html>`;
}

export function appointmentUpdateTemplate(
  candidateName: string,
  typeLabel: string,
  dateStr: string,
  timeStr: string,
  agencyName: string,
  notes: string | null,
  kind: 'verschoben' | 'abgesagt',
): string {
  const headline = kind === 'verschoben' ? 'Dein Termin wurde verschoben' : 'Dein Termin wurde abgesagt';
  const intro =
    kind === 'verschoben'
      ? `Hallo ${candidateName}, dein <strong>${typeLabel}</strong> bei <strong>${agencyName}</strong> findet zu einer neuen Zeit statt:`
      : `Hallo ${candidateName}, dein <strong>${typeLabel}</strong> bei <strong>${agencyName}</strong> am ${dateStr} um ${timeStr} Uhr wurde leider abgesagt.`;
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">${agencyName}</h2>
      <p style="margin:0;font-size:13px;color:#888;">${kind === 'verschoben' ? 'Terminänderung' : 'Terminabsage'}</p>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">${headline}</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">${intro}</p>
      ${kind === 'verschoben' ? `
      <div style="background:#f5f5f7;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:15px;color:#111;"><strong>📅 ${dateStr}</strong></p>
        <p style="margin:0;font-size:15px;color:#111;"><strong>🕐 ${timeStr} Uhr</strong></p>
        ${notes ? `<p style="margin:12px 0 0;font-size:14px;color:#444;">${notes}</p>` : ''}
      </div>
      <p style="font-size:14px;color:#666;line-height:1.6;margin:0;">
        Bitte sei pünktlich. Falls du den neuen Termin nicht wahrnehmen kannst, gib bitte rechtzeitig Bescheid.
      </p>` : `
      <p style="font-size:14px;color:#666;line-height:1.6;margin:0;">
        Bei Fragen melde dich gerne direkt bei ${agencyName}.
      </p>`}
    </div>
  </div>
</body></html>`;
}

export function surveyNotificationTemplate(name: string, surveyTitle: string, portalUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Wir brauchen dein Feedback!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
        Hallo ${name}, es gibt einen neuen Feedback-Check: <strong>${surveyTitle}</strong>. Deine Meinung hilft uns, unsere Zusammenarbeit zu verbessern.
      </p>
      <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Feedback geben
      </a>
    </div>
  </div>
</body></html>`;
}
