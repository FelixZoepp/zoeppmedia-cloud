type ReportTyp = 'tag_7' | 'tag_14';

interface Tag7Data {
  zeitraum: string;
  kampagnen_live_seit: string;
  spend: number;
  impressionen: number;
  klicks: number;
  leads: number;
  cpl: number;
  bewerbungen: number;
  termine: number;
  was_in_woche_2_passiert: string;
}

interface Tag14Data {
  zeitraum: string;
  spend_w2: number;
  spend_w1: number;
  spend_delta: string;
  leads_w2: number;
  leads_w1: number;
  leads_delta: string;
  cpl_w2: number;
  cpl_w1: number;
  terminquote: string;
  show_rate: string;
  empfehlung_budget: string;
  empfehlung_creatives: string;
}

function deltaArrow(delta: string): string {
  if (delta.startsWith('+')) return `<span style="color:#16a34a;font-weight:600;">${delta} &#8593;</span>`;
  if (delta.startsWith('-')) return `<span style="color:#dc2626;font-weight:600;">${delta} &#8595;</span>`;
  return `<span style="color:#6b7280;font-weight:600;">${delta}</span>`;
}

function metricRow(label: string, value: string | number, delta?: string): string {
  return `
    <tr>
      <td style="padding:12px 16px;font-size:14px;color:#444;border-bottom:1px solid #f3f4f6;">${label}</td>
      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#111;text-align:right;border-bottom:1px solid #f3f4f6;">
        ${value}${delta ? ` <span style="font-size:12px;font-weight:400;margin-left:4px;">${deltaArrow(delta)}</span>` : ''}
      </td>
    </tr>`;
}

function formatEuro(val: number): string {
  return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function formatNumber(val: number): string {
  return val.toLocaleString('de-DE');
}

function buildTag7Html(data: Tag7Data, agencyName: string, dashboardUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

    <!-- Header -->
    <div style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #f3f4f6;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
      <p style="margin:0;font-size:13px;color:#888;">Kampagnen-Report</p>
    </div>

    <!-- Title -->
    <div style="padding:24px 40px 16px;">
      <h1 style="font-size:24px;font-weight:700;color:#111;margin:0 0 8px;">Tag-7 Report</h1>
      <p style="font-size:14px;color:#666;margin:0;">
        ${agencyName} &middot; ${data.zeitraum} &middot; Kampagne live seit ${new Date(data.kampagnen_live_seit).toLocaleDateString('de-DE')}
      </p>
    </div>

    <!-- Kampagnen-Performance -->
    <div style="padding:0 40px 24px;">
      <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#E0354B;margin:0 0 12px;">Kampagnen-Performance</h3>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:12px;overflow:hidden;">
        ${metricRow('Spend', formatEuro(data.spend))}
        ${metricRow('Impressionen', formatNumber(data.impressionen))}
        ${metricRow('Klicks', formatNumber(data.klicks))}
        ${metricRow('Leads', String(data.leads))}
        ${metricRow('CPL', formatEuro(data.cpl))}
      </table>
    </div>

    <!-- Recruiting -->
    <div style="padding:0 40px 24px;">
      <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#E0354B;margin:0 0 12px;">Recruiting</h3>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:12px;overflow:hidden;">
        ${metricRow('Bewerbungen', String(data.bewerbungen))}
        ${metricRow('Termine', String(data.termine))}
      </table>
    </div>

    <!-- Ausblick Woche 2 -->
    <div style="padding:0 40px 32px;">
      <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#E0354B;margin:0 0 12px;">Ausblick Woche 2</h3>
      <div style="background:#fef3c7;border-radius:12px;padding:16px;">
        <p style="font-size:14px;color:#92400e;margin:0;line-height:1.6;">${data.was_in_woche_2_passiert}</p>
      </div>
    </div>

    <!-- CTA -->
    <div style="padding:0 40px 32px;text-align:center;">
      <a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Report im Dashboard ansehen
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 40px;background:#f9fafb;text-align:center;">
      <p style="font-size:12px;color:#999;margin:0;">Dieser Report wurde automatisch von Zoepp Media Cloud generiert.</p>
    </div>
  </div>
</body></html>`;
}

function buildTag14Html(data: Tag14Data, agencyName: string, dashboardUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

    <!-- Header -->
    <div style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #f3f4f6;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
      <p style="margin:0;font-size:13px;color:#888;">Kampagnen-Report</p>
    </div>

    <!-- Title -->
    <div style="padding:24px 40px 16px;">
      <h1 style="font-size:24px;font-weight:700;color:#111;margin:0 0 8px;">Tag-14 Report</h1>
      <p style="font-size:14px;color:#666;margin:0;">
        ${agencyName} &middot; ${data.zeitraum} &middot; Vergleich Woche 1 vs. Woche 2
      </p>
    </div>

    <!-- Spend Vergleich -->
    <div style="padding:0 40px 24px;">
      <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#E0354B;margin:0 0 12px;">Spend</h3>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:12px;overflow:hidden;">
        ${metricRow('Woche 1', formatEuro(data.spend_w1))}
        ${metricRow('Woche 2', formatEuro(data.spend_w2), data.spend_delta)}
      </table>
    </div>

    <!-- Leads Vergleich -->
    <div style="padding:0 40px 24px;">
      <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#E0354B;margin:0 0 12px;">Leads</h3>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:12px;overflow:hidden;">
        ${metricRow('Woche 1', String(data.leads_w1))}
        ${metricRow('Woche 2', String(data.leads_w2), data.leads_delta)}
      </table>
    </div>

    <!-- CPL Vergleich -->
    <div style="padding:0 40px 24px;">
      <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#E0354B;margin:0 0 12px;">Cost per Lead</h3>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:12px;overflow:hidden;">
        ${metricRow('CPL Woche 1', formatEuro(data.cpl_w1))}
        ${metricRow('CPL Woche 2', formatEuro(data.cpl_w2))}
      </table>
    </div>

    <!-- Recruiting KPIs -->
    <div style="padding:0 40px 24px;">
      <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#E0354B;margin:0 0 12px;">Recruiting KPIs</h3>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:12px;overflow:hidden;">
        ${metricRow('Terminquote', data.terminquote)}
        ${metricRow('Show-Rate', data.show_rate)}
      </table>
    </div>

    <!-- Empfehlungen -->
    <div style="padding:0 40px 32px;">
      <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#E0354B;margin:0 0 12px;">Empfehlungen</h3>
      <div style="background:#f0fdf4;border-radius:12px;padding:16px;margin-bottom:12px;">
        <p style="font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Budget</p>
        <p style="font-size:14px;color:#166534;margin:0;line-height:1.6;">${data.empfehlung_budget}</p>
      </div>
      <div style="background:#eff6ff;border-radius:12px;padding:16px;">
        <p style="font-size:12px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Creatives</p>
        <p style="font-size:14px;color:#1e40af;margin:0;line-height:1.6;">${data.empfehlung_creatives}</p>
      </div>
    </div>

    <!-- CTA -->
    <div style="padding:0 40px 32px;text-align:center;">
      <a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Report im Dashboard ansehen
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 40px;background:#f9fafb;text-align:center;">
      <p style="font-size:12px;color:#999;margin:0;">Dieser Report wurde automatisch von Zoepp Media Cloud generiert.</p>
    </div>
  </div>
</body></html>`;
}

export function reportTemplate(
  typ: ReportTyp,
  daten: Record<string, unknown>,
  agencyName: string,
  dashboardUrl: string,
): string {
  if (typ === 'tag_7') {
    return buildTag7Html(daten as unknown as Tag7Data, agencyName, dashboardUrl);
  }
  return buildTag14Html(daten as unknown as Tag14Data, agencyName, dashboardUrl);
}
