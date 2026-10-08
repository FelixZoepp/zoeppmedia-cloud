/**
 * Admin-Navigation: wenige Bereiche in der Seitenleiste, die Unterseiten als Tabs oben (BereichTabs).
 * Die erste Seite eines Bereichs ist das Ziel des Menüpunkts.
 */

export interface Bereich {
  id: string;
  label: string;
  tabs: Array<{ label: string; href: string }>;
}

export const ADMIN_BEREICHE: Bereich[] = [
  {
    id: 'kunden',
    label: 'Kunden',
    tabs: [
      { label: 'Kunden-Board', href: '/clients' },
      { label: 'Ergebnisse', href: '/ergebnisse' },
      { label: 'Anfragen', href: '/admin/support' },
      { label: 'Wochenberichte & Erinnerungen', href: '/admin/wochenberichte' },
      { label: 'Start-Analyse', href: '/start-analyse' },
    ],
  },
  {
    id: 'recruiting-cloud',
    label: 'Recruiting-Cloud',
    tabs: [
      { label: 'Kunden-Übersicht', href: '/admin/recruiting' },
      { label: 'Innendienst', href: '/innendienst' },
      { label: 'Bewerber-Anbindung', href: '/admin/anbindung' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    tabs: [
      { label: 'Team', href: '/team' },
      { label: 'Kapazität', href: '/admin/kapazitaet' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    tabs: [
      { label: 'Sales-Controlling', href: '/admin/vertrieb' },
      { label: 'Pipeline', href: '/admin/sales' },
      { label: 'After-Close', href: '/admin/after-close' },
      { label: 'Sales-WhatsApp', href: '/api/admin/sales-inbox' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    tabs: [
      { label: 'Wochenbericht', href: '/admin/wochenbericht' },
      { label: 'Meta Ads', href: '/admin/marketing' },
      { label: 'Funnel Report', href: '/admin/report' },
    ],
  },
  {
    id: 'finanzen',
    label: 'Finanzen',
    tabs: [
      { label: 'Übersicht & Freigaben', href: '/admin/buchhaltung' },
      { label: 'Rechnungen & Mahnwesen', href: '/buchhaltung' },
      { label: 'Kunden & MRR', href: '/admin/finanzen/kunden' },
      { label: 'Umsatz-Analyse', href: '/admin/umsatz' },
    ],
  },
  {
    id: 'verwaltung',
    label: 'Verwaltung',
    tabs: [
      { label: 'Masterclass', href: '/admin/masterclass' },
      { label: 'Team-Akademie', href: '/admin/akademie' },
      { label: 'Einladungen', href: '/invites' },
      { label: 'Templates', href: '/admin/templates' },
      { label: 'KPI', href: '/admin/kpi' },
      { label: 'Reports', href: '/admin/reports' },
      { label: 'Health', href: '/admin/health' },
      { label: 'Audit Log', href: '/admin/audit' },
    ],
  },
];

const passt = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Bereich und aktiver Tab zur aktuellen Seite (längster Treffer gewinnt) */
export function bereichFuer(pathname: string): { bereich: Bereich; tab: string } | null {
  let best: { bereich: Bereich; tab: string } | null = null;
  for (const b of ADMIN_BEREICHE) {
    for (const t of b.tabs) {
      if (!t.href.startsWith('/api/') && passt(pathname, t.href) && (!best || t.href.length > best.tab.length)) best = { bereich: b, tab: t.href };
    }
  }
  return best;
}
