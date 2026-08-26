export interface WeeklyReportEmailParams {
  contact_name: string;
  kw: number;
  current: {
    candidates: number;
    contacted: number;
    interviews: number;
    hired: number;
    median_ttfc: number | null;
  };
  previous: {
    candidates: number;
    contacted: number;
    interviews: number;
    hired: number;
  };
  activities: { type: string; count: number }[];
  open_issues: string[];
  tip: string;
  dashboard_url: string;
}

function delta(current: number, previous: number): string {
  if (current > previous) return `<span style="color:#16a34a;">&#8593; +${current - previous}</span>`;
  if (current < previous) return `<span style="color:#dc2626;">&#8595; ${current - previous}</span>`;
  return '<span style="color:#6b7280;">&#8594; 0</span>';
}

function ttfcDisplay(seconds: number | null): string {
  if (seconds === null) return '<span style="color:#6b7280;">&#8212;</span>';
  const hours = seconds / 3600;
  let emoji: string;
  let color: string;
  if (hours <= 1) {
    emoji = '&#x1F7E2;'; // green circle
    color = '#16a34a';
  } else if (hours <= 4) {
    emoji = '&#x1F7E1;'; // yellow circle
    color = '#ca8a04';
  } else {
    emoji = '&#x1F534;'; // red circle
    color = '#dc2626';
  }

  if (hours < 1) {
    const minutes = Math.round(seconds / 60);
    return `<span style="color:${color};">${emoji} ${minutes} Min.</span>`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `<span style="color:${color};">${emoji} ${h} Std.</span>`;
  return `<span style="color:${color};">${emoji} ${h} Std. ${m} Min.</span>`;
}

function statRow(label: string, current: number, previous: number): string {
  return `
    <tr>
      <td style="padding:10px 16px;font-size:15px;color:#111827;border-bottom:1px solid #f3f4f6;">${label}</td>
      <td style="padding:10px 16px;font-size:15px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;">${current}</td>
      <td style="padding:10px 16px;font-size:13px;text-align:right;border-bottom:1px solid #f3f4f6;">${delta(current, previous)}</td>
    </tr>`;
}

export function generateWeeklyReportEmail(params: WeeklyReportEmailParams): string {
  const {
    contact_name,
    kw,
    current,
    previous,
    activities,
    open_issues,
    tip,
    dashboard_url,
  } = params;

  const activitiesHtml =
    activities.length > 0
      ? activities
          .map(
            (a) =>
              `<li style="font-size:15px;color:#444;line-height:1.8;">${a.count}x ${a.type}</li>`
          )
          .join('')
      : '<p style="font-size:15px;color:#444;line-height:1.6;">Diese Woche war keine Nacharbeit n&ouml;tig &mdash; deine Kampagnen laufen stabil.</p>';

  const openIssuesHtml =
    open_issues.length > 0
      ? `<ul style="margin:0;padding-left:20px;">${open_issues
          .map(
            (issue) =>
              `<li style="font-size:15px;color:#444;line-height:1.8;">${issue}</li>`
          )
          .join('')}</ul>`
      : '<p style="font-size:15px;color:#6b7280;line-height:1.6;">Keine offenen Punkte &mdash; alles l&auml;uft.</p>';

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wochenbericht KW ${kw}</title>
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

    <!-- Header -->
    <div style="background:#DC2626;padding:28px 40px;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Zoepp Media Cloud</h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">Wochenbericht KW ${kw}</p>
    </div>

    <!-- Greeting -->
    <div style="padding:32px 40px 0;">
      <p style="font-size:15px;color:#111827;line-height:1.6;margin:0 0 24px;">
        Hallo ${contact_name}, hier ist dein Wochenbericht f&uuml;r KW&nbsp;${kw}.
      </p>
    </div>

    <!-- Zahlen der Woche -->
    <div style="padding:0 40px;">
      <h2 style="font-size:16px;font-weight:700;color:#DC2626;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Zahlen der Woche</h2>
      <table style="width:100%;border-collapse:collapse;background:#F9FAFB;border-radius:12px;overflow:hidden;">
        <thead>
          <tr>
            <th style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Metrik</th>
            <th style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Wert</th>
            <th style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">vs. Vorwoche</th>
          </tr>
        </thead>
        <tbody>
          ${statRow('Neue Bewerbungen', current.candidates, previous.candidates)}
          ${statRow('Kontaktiert', current.contacted, previous.contacted)}
          ${statRow('Termine vereinbart', current.interviews, previous.interviews)}
          ${statRow('Eingestellt', current.hired, previous.hired)}
          <tr>
            <td style="padding:10px 16px;font-size:15px;color:#111827;">Median Erstkontaktzeit</td>
            <td colspan="2" style="padding:10px 16px;font-size:15px;font-weight:600;text-align:right;">${ttfcDisplay(current.median_ttfc)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Was wir gemacht haben -->
    <div style="padding:28px 40px 0;">
      <h2 style="font-size:16px;font-weight:700;color:#DC2626;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Was wir f&uuml;r dich gemacht haben</h2>
      ${
        activities.length > 0
          ? `<ul style="margin:0;padding-left:20px;">${activitiesHtml}</ul>`
          : activitiesHtml
      }
    </div>

    <!-- Offene Punkte -->
    <div style="padding:28px 40px 0;">
      <h2 style="font-size:16px;font-weight:700;color:#DC2626;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Offene Punkte</h2>
      ${openIssuesHtml}
    </div>

    <!-- Tipp der Woche -->
    <div style="padding:28px 40px 0;">
      <h2 style="font-size:16px;font-weight:700;color:#DC2626;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Tipp der Woche</h2>
      <div style="background:#FEF2F2;border-left:4px solid #DC2626;padding:14px 18px;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:15px;color:#111827;line-height:1.6;">${tip}</p>
      </div>
    </div>

    <!-- CTA -->
    <div style="padding:32px 40px;text-align:center;">
      <a href="${dashboard_url}" style="display:inline-block;padding:14px 40px;background:#DC2626;color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Dashboard &ouml;ffnen
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 40px 24px;text-align:center;border-top:1px solid #f3f4f6;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        Zoepp Media Cloud &mdash; Bewerber-Management f&uuml;r D2D-Agenturen
      </p>
    </div>

  </div>
</body>
</html>`;
}
