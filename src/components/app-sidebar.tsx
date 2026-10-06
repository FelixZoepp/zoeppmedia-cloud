'use client';

import Link from 'next/link';
import { Sidebar, type SidebarGroup, type SidebarItem } from '@/components/ui/sidebar';
import { InstallPromo } from '@/components/install-promo';
import { KUNDEN_CLOUD_BEREICHE, SALES_BEREICHE } from '@/lib/team/funktionen';
import type { UserRole } from '@/lib/auth';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Settings,
  ClipboardList,
  Sparkles,
  FolderKanban,
  GraduationCap,
  BarChart3,
  Building2,
  Target,
  FileText,
  UserCircle,
  LogOut,
  Megaphone,
  Handshake,
  BarChart3 as ChartBar,
  CalendarDays,
  Timer,
  Shield,
  CheckSquare,
  FileBarChart,
  Activity,
  Gauge,
  Receipt,
  PlusCircle,
  PhoneCall,
  Briefcase,
  MessageSquare,
  Smartphone,
  Menu,
  LifeBuoy,
  Headset,
  TrendingUp,
  Plug,
  Lightbulb,
  MessagesSquare,
} from 'lucide-react';

const adminGroups: SidebarGroup[] = [
  {
    label: 'Cockpit',
    items: [
      { id: 'meine-todos', label: 'Meine Aufgaben', icon: <CheckSquare className="w-5 h-5" />, href: '/meine-todos' },
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin' },
      { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
      { id: 'ergebnisse', label: 'Kunden-Ergebnisse', icon: <TrendingUp className="w-5 h-5" />, href: '/ergebnisse' },
      { id: 'kunden-anfragen', label: 'Kunden-Anfragen', icon: <MessagesSquare className="w-5 h-5" />, href: '/admin/support' },
      { id: 'start-analyse', label: 'Start-Analyse', icon: <Timer className="w-5 h-5" />, href: '/start-analyse' },
      { id: 'kapazitaet', label: 'Kapazität', icon: <Gauge className="w-5 h-5" />, href: '/admin/kapazitaet' },
      { id: 'team', label: 'Team', icon: <Users className="w-5 h-5" />, href: '/team' },
      { id: 'kalender', label: 'Kalender', icon: <CalendarDays className="w-5 h-5" />, href: '/kalender' },
    ],
  },
  {
    label: 'Fulfillment',
    items: [
    ],
  },
  {
    label: 'Recruiting-Cloud',
    items: [
      { id: 'innendienst', label: 'Innendienst', icon: <Headset className="w-5 h-5" />, href: '/innendienst' },
      { id: 'anbindung', label: 'Bewerber-Anbindung', icon: <Plug className="w-5 h-5" />, href: '/admin/anbindung' },
      { id: 'admin-recruiting', label: 'Kunden-Übersicht', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin/recruiting' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { id: 'vertrieb', label: 'Sales-Controlling', icon: <Target className="w-5 h-5" />, href: '/admin/vertrieb' },
      { id: 'sales', label: 'Sales Pipeline', icon: <Handshake className="w-5 h-5" />, href: '/admin/sales' },
      { id: 'sales-inbox', label: 'Sales-WhatsApp', icon: <MessageSquare className="w-5 h-5" />, href: '/api/admin/sales-inbox' },
      { id: 'wochenbericht', label: 'Wochenbericht', icon: <CalendarDays className="w-5 h-5" />, href: '/admin/wochenbericht' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { id: 'marketing', label: 'Meta Ads', icon: <Megaphone className="w-5 h-5" />, href: '/admin/marketing' },
      { id: 'report', label: 'Funnel Report', icon: <ChartBar className="w-5 h-5" />, href: '/admin/report' },
    ],
  },
  {
    label: 'Buchhaltung',
    items: [
      { id: 'rechnungen-mahnwesen', label: 'Rechnungen & Mahnwesen', icon: <Receipt className="w-5 h-5" />, href: '/buchhaltung' },
      { id: 'buchhaltung', label: 'Übersicht & Freigaben', icon: <Receipt className="w-5 h-5" />, href: '/admin/buchhaltung' },
      { id: 'finanzen-kunden', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/admin/finanzen/kunden' },
    ],
  },
  {
    label: 'Verwaltung',
    items: [
      { id: 'ads', label: 'Ads', icon: <Megaphone className="w-5 h-5" />, href: '/ads' },
      { id: 'after-close', label: 'After-Close', icon: <PlusCircle className="w-5 h-5" />, href: '/admin/after-close' },
      { id: 'admin-reports', label: 'Reports', icon: <FileBarChart className="w-5 h-5" />, href: '/admin/reports' },
      { id: 'health', label: 'Health', icon: <Activity className="w-5 h-5" />, href: '/admin/health' },
      { id: 'masterclass', label: 'Masterclass', icon: <GraduationCap className="w-5 h-5" />, href: '/admin/masterclass' },
      { id: 'kpi', label: 'KPI Einstellungen', icon: <Target className="w-5 h-5" />, href: '/admin/kpi' },
      { id: 'templates', label: 'Templates', icon: <FileText className="w-5 h-5" />, href: '/admin/templates' },
      { id: 'invites', label: 'Einladungen', icon: <UserPlus className="w-5 h-5" />, href: '/invites' },
      { id: 'audit', label: 'Audit Log', icon: <Shield className="w-5 h-5" />, href: '/admin/audit' },
    ],
  },
];

const employeeGroups: SidebarGroup[] = [
  {
    label: 'Meine Arbeit',
    items: [
      { id: 'meine-todos', label: 'Meine Aufgaben', icon: <CheckSquare className="w-5 h-5" />, href: '/meine-todos' },
      { id: 'ads', label: 'Ads', icon: <Megaphone className="w-5 h-5" />, href: '/ads' },
      { id: 'rechnungen-mahnwesen', label: 'Buchhaltung', icon: <Receipt className="w-5 h-5" />, href: '/buchhaltung' },
      { id: 'dialer', label: 'Dialer', icon: <PhoneCall className="w-5 h-5" />, href: '/dialer' },
      { id: 'ttfc', label: 'Speed-to-Lead', icon: <Timer className="w-5 h-5" />, href: '/admin/ttfc' },
      { id: 'kalender', label: 'Kalender', icon: <CalendarDays className="w-5 h-5" />, href: '/kalender' },
    ],
  },
  {
    label: 'Cockpit',
    items: [
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin' },
      { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
      { id: 'ergebnisse', label: 'Kunden-Ergebnisse', icon: <TrendingUp className="w-5 h-5" />, href: '/ergebnisse' },
      { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-5 h-5" />, href: '/employee-reports' },
      { id: 'invites', label: 'Einladungen', icon: <UserPlus className="w-5 h-5" />, href: '/invites' },
    ],
  },
  {
    label: 'Fulfillment',
    items: [
      { id: 'ai-tools', label: 'AI Tools', icon: <Sparkles className="w-5 h-5" />, href: '/ai-tools' },
      { id: 'funnels', label: 'Funnels', icon: <FolderKanban className="w-5 h-5" />, href: '/funnels' },
    ],
  },
];

const agencyGroups: SidebarGroup[] = [
  {
    label: 'Recruiting',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, href: '/dashboard' },
      { id: 'candidates', label: 'Bewerber', icon: <ClipboardList className="w-5 h-5" />, href: '/candidates' },
      { id: 'anrufen', label: 'Anrufen', icon: <PhoneCall className="w-5 h-5" />, href: '/anrufen' },
      { id: 'inbox', label: 'Chat', icon: <MessageSquare className="w-5 h-5" />, href: '/inbox' },
      { id: 'termine', label: 'Kalender', icon: <CalendarDays className="w-5 h-5" />, href: '/termine' },
      { id: 'statistiken', label: 'Statistiken', icon: <BarChart3 className="w-5 h-5" />, href: '/statistiken' },
      { id: 'umsaetze', label: 'Umsätze & ROI', icon: <TrendingUp className="w-5 h-5" />, href: '/umsaetze' },
      { id: 'empfehlungen', label: 'Empfehlungen', icon: <Lightbulb className="w-5 h-5" />, href: '/empfehlungen' },
    ],
  },
  {
    label: 'Kampagne',
    items: [
      { id: 'jobs', label: 'Stellenanzeigen', icon: <Briefcase className="w-5 h-5" />, href: '/jobs' },
      { id: 'reports', label: 'Monatsreport', icon: <FileBarChart className="w-5 h-5" />, href: '/reports' },
    ],
  },
  {
    label: 'Zusammenarbeit',
    items: [
      { id: 'deine-aufgaben', label: 'Deine Aufgaben', icon: <CheckSquare className="w-5 h-5" />, href: '/deine-aufgaben' },
      { id: 'masterclass', label: 'Masterclass', icon: <GraduationCap className="w-5 h-5" />, href: '/masterclass' },
    ],
  },
  {
    label: 'Einstellungen',
    items: [
      { id: 'team-zugaenge', label: 'Team & Zugänge', icon: <Users className="w-5 h-5" />, href: '/settings/team' },
      { id: 'whatsapp', label: 'WhatsApp', icon: <Smartphone className="w-5 h-5" />, href: '/settings/whatsapp' },
    ],
  },
];

const settingsItem: SidebarItem = {
  id: 'settings',
  label: 'Einstellungen',
  icon: <Settings className="w-5 h-5" />,
  href: '/settings',
};

const profileItem: SidebarItem = {
  id: 'profile',
  label: 'Profil',
  icon: <UserCircle className="w-5 h-5" />,
  href: '/profile',
};

/** Kunden: Hilfe-Center heißt dort „FAQ & Support“ (mit Support-Anfrage) */
const kundenHilfeItem: SidebarItem = {
  id: 'hilfe',
  label: 'FAQ & Support',
  icon: <LifeBuoy className="w-5 h-5" />,
  href: '/hilfe',
};

const helpItem: SidebarItem = {
  id: 'hilfe',
  label: 'Hilfe',
  icon: <LifeBuoy className="w-5 h-5" />,
  href: '/hilfe',
};

const logoutItem: SidebarItem = {
  id: 'logout',
  label: 'Logout',
  icon: <LogOut className="w-5 h-5" />,
  href: '/api/auth/logout',
};

function getGroupsForRole(role: UserRole): SidebarGroup[] {
  switch (role) {
    case 'admin': return adminGroups;
    case 'employee': return employeeGroups;
    case 'agency_owner':
    case 'agency_member':
    case 'agency_viewer':
      return agencyGroups;
  }
}

interface AppSidebarProps {
  role: UserRole;
  userName: string;
  /** Bereich intern – Vertrieb sieht zusätzlich das Sales-Controlling */
  funktion?: string | null;
  logoUrl?: string | null;
  onClose?: () => void;
}

export function AppSidebar({ role, userName, funktion, logoUrl, onClose }: AppSidebarProps) {
  const groups =
    role === 'employee' && KUNDEN_CLOUD_BEREICHE.includes(funktion ?? '')
      ? [
          {
            label: 'Innendienst',
            items: [{ id: 'innendienst', label: 'Kunden-Clouds', icon: <Headset className="w-5 h-5" />, href: '/innendienst' }],
          },
          ...employeeGroups,
        ]
      : role === 'employee' && funktion === 'csm'
        ? [
            {
              label: 'Kundenbetreuung',
              items: [
                { id: 'ergebnisse', label: 'Kunden-Ergebnisse', icon: <TrendingUp className="w-5 h-5" />, href: '/ergebnisse' },
                { id: 'kunden-anfragen', label: 'Kunden-Anfragen', icon: <MessagesSquare className="w-5 h-5" />, href: '/admin/support' },
              ],
            },
            // Eintrag steht schon oben – nicht doppelt im Cockpit
            ...employeeGroups.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== 'ergebnisse') })),
          ]
        : role === 'employee' && SALES_BEREICHE.includes(funktion ?? '')
      ? [
          {
            label: 'Sales',
            items: [{ id: 'vertrieb', label: 'Sales-Controlling', icon: <Target className="w-5 h-5" />, href: '/admin/vertrieb' }],
          },
          ...employeeGroups,
        ]
      : getGroupsForRole(role);
  const initial = userName.charAt(0).toUpperCase();
  const isInternal = role === 'admin' || role === 'employee';

  const bottomItems = isInternal
    ? [profileItem, settingsItem, helpItem, logoutItem]
    : [settingsItem, kundenHilfeItem, logoutItem];

  return (
    <Sidebar
      brand={isInternal ? 'Z' : initial}
      brandImage={isInternal ? null : logoUrl ?? null}
      brandLabel={isInternal ? 'Zoepp Media' : userName}
      brandSub={role === 'admin' ? 'Admin' : role === 'employee' ? 'Mitarbeiter' : 'Recruiting Cloud'}
      groups={groups}
      bottomItems={bottomItems}
      promo={<InstallPromo />}
      onClose={onClose}
    />
  );
}

/* ── Mobile: untere Tab-Leiste ──────────────────────────────────── */

const MOBILE_TABS: Record<'internal_admin' | 'internal_employee' | 'agency', SidebarItem[]> = {
  internal_admin: [
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard />, href: '/admin' },
    { id: 'meine-todos', label: 'Aufgaben', icon: <CheckSquare />, href: '/meine-todos' },
    { id: 'clients', label: 'Kunden', icon: <Building2 />, href: '/clients' },
    { id: 'team', label: 'Team', icon: <Users />, href: '/team' },
  ],
  internal_employee: [
    { id: 'meine-todos', label: 'Aufgaben', icon: <CheckSquare />, href: '/meine-todos' },
    { id: 'clients', label: 'Kunden', icon: <Building2 />, href: '/clients' },
    { id: 'dialer', label: 'Dialer', icon: <PhoneCall />, href: '/dialer' },
    { id: 'ads', label: 'Ads', icon: <Megaphone />, href: '/ads' },
  ],
  agency: [
    { id: 'dashboard', label: 'Start', icon: <LayoutDashboard />, href: '/dashboard' },
    { id: 'candidates', label: 'Bewerber', icon: <ClipboardList />, href: '/candidates' },
    { id: 'anrufen', label: 'Anrufen', icon: <PhoneCall />, href: '/anrufen' },
    { id: 'inbox', label: 'Chat', icon: <MessageSquare />, href: '/inbox' },
  ],
};

export function MobileTabBar({ role, pathname, onMore }: { role: UserRole; pathname: string; onMore: () => void }) {
  const tabs = role === 'admin' ? MOBILE_TABS.internal_admin : role === 'employee' ? MOBILE_TABS.internal_employee : MOBILE_TABS.agency;
  const active = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(t.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const cls = (on: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[14px] py-2 text-[11px] font-medium transition-colors [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:stroke-[1.75] ${
      on ? 'bg-red-50 text-red-800' : 'text-gray-600 active:bg-gray-100'
    }`;

  return (
    <nav
      aria-label="Schnellnavigation"
      className="fixed inset-x-2.5 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-2xl bg-card/95 p-1.5 shadow-[0_0_0_1px_var(--hair),0_18px_40px_-18px_#1a151480] backdrop-blur md:hidden"
    >
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} className={cls(t.href === active)} aria-current={t.href === active ? 'page' : undefined}>
          {t.icon}
          <span className="max-w-full truncate">{t.label}</span>
        </Link>
      ))}
      <button type="button" onClick={onMore} className={cls(false)}>
        <Menu />
        <span>Mehr</span>
      </button>
    </nav>
  );
}
