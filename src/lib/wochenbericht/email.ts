import type { KundenUeberblick } from './berechnung';

/**
 * HTML-E-Mail für den Wochenüberblick (Tabellen-Layout, inline Styles – läuft in allen Mail-Programmen).
 * Bewusst neutral: keine Ampel, keine Wertung – nur Zahlen, Erledigtes und nächste Schritte.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function betreffWochenbericht(b: KundenUeberblick): string {
  return `Dein Wochenüberblick KW ${b.kw} – ${b.firma}`;
}

function liste(titel: string, punkte: string[]): string {
  if (!punkte.length) return '';
  return `
    <tr><td style="padding:20px 32px 0;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;">${esc(titel)}</p>
      ${punkte.map((p) => `<p style="margin:0 0 6px;font-size:15px;line-height:1.5;color:#111827;">• ${esc(p)}</p>`).join('')}
    </td></tr>`;
}

export function wochenberichtHtml(b: KundenUeberblick, cloudUrl: string): string {
  const kennzahlen = b.kunde.kennzahlen
    .map(
      (k) => `
      <tr>
        <td style="padding:10px 0;font-size:15px;color:#374151;border-bottom:1px solid #f3f4f6;">${esc(k.label)}</td>
        <td style="padding:10px 0 10px 12px;text-align:right;border-bottom:1px solid #f3f4f6;">
          <span style="font-size:16px;font-weight:700;color:#111827;">${esc(k.wert)}</span>${k.vorwoche ? `<br><span style="font-size:12px;color:#6b7280;">${esc(k.vorwoche)} zur Vorwoche</span>` : ''}
        </td>
      </tr>`,
    )
    .join('');
  const schritte = [...b.kunde.naechsteSchritte, ...b.deineAufgaben];

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wochenüberblick KW ${b.kw}</title></head>
<body style="margin:0;padding:0;background:#f4f1ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
  <tr><td style="padding:28px 32px 8px;">
    <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a3201a;">Wochenüberblick · KW ${b.kw} · ${esc(b.zeitraum)}</p>
    <p style="margin:10px 0 0;font-size:16px;color:#374151;">Hallo ${esc(b.vorname)},</p>
    <p style="margin:6px 0 0;font-size:15px;line-height:1.5;color:#374151;">hier ist dein Überblick für ${esc(b.firma)}${b.modus === 'aufbau' ? ' – der aktuelle Stand auf dem Weg zum Kampagnenstart' : ' – die Zahlen deiner Recruiting-Woche'}.</p>
  </td></tr>

  <tr><td style="padding:16px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${kennzahlen}</table>
  </td></tr>

  ${liste('Deine nächsten Schritte', schritte)}
  ${liste('Das haben wir diese Woche erledigt', b.wirErledigt)}
  ${liste('Als Nächstes kümmern wir uns um', b.wirAlsNaechstes)}

  ${
    b.empfehlung
      ? `<tr><td style="padding:20px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f4;border-radius:12px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#a3201a;">Unser Tipp für nächste Woche</p>
        <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#111827;">${esc(b.empfehlung.titel)}</p>
        <p style="margin:4px 0 0;font-size:14px;line-height:1.5;color:#4b5563;">${esc(b.empfehlung.warum)}</p>
      </td></tr>
    </table>
  </td></tr>`
      : ''
  }

  <tr><td style="padding:28px 32px 32px;" align="left">
    <a href="${esc(cloudUrl)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#a3201a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Zur Cloud</a>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">Fragen? Antworte einfach in der Cloud unter „FAQ &amp; Support“ – dein Team von Zoepp Media.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
