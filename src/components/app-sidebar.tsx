'use client';

import { Sidebar, type SidebarGroup, type SidebarItem } from '@/components/ui/sidebar';
import { InstallPromo } from '@/components/install-promo';
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
} from 'lucide-react';

const adminGroups: SidebarGroup[] = [
  {
    label: 'Cockpit',
    items: [
      { id: 'meine-todos', label: 'Meine Aufgaben', icon: <CheckSquare className="w-5 h-5" />, href: '/meine-todos' },
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin' },
      { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
      { id: 'start-analyse', label: 'Start-Analyse', icon: <Timer className="w-5 h-5" />, href: '/start-analyse' },
      { id: 'kapazitaet', label: 'Kapazität', icon: <Gauge className="w-5 h-5" />, href: '/admin/kapazitaet' },
      { id: 'team', label: 'Team', icon: <Users className="w-5 h-5" />, href: '/team' },
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
      { id: 'admin-recruiting', label: 'Kunden-Übersicht', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin/recruiting' },
    ],
  },
  {
    label: 'Marketing & Sales',
    items: [
      { id: 'marketing', label: 'Meta Ads', icon: <Megaphone className="w-5 h-5" />, href: '/admin/marketing' },
      { id: 'sales', label: 'Sales Pipeline', icon: <Handshake className="w-5 h-5" />, href: '/admin/sales' },
      { id: 'sales-inbox', label: 'Sales-WhatsApp', icon: <MessageSquare className="w-5 h-5" />, href: '/api/admin/sales-inbox' },
      { id: 'report', label: 'Funnel Report', icon: <ChartBar className="w-5 h-5" />, href: '/admin/report' },
      { id: 'wochenbericht', label: 'Wochenbericht', icon: <CalendarDays className="w-5 h-5" />, href: '/admin/wochenbericht' },
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
    ],
  },
  {
    label: 'Cockpit',
    items: [
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin' },
      { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
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
      { id: 'inbox', label: 'Inbox', icon: <MessageSquare className="w-5 h-5" />, href: '/inbox' },
      { id: 'jobs', label: 'Stellenanzeigen', icon: <Briefcase className="w-5 h-5" />, href: '/jobs' },
      { id: 'candidates', label: 'Bewerber', icon: <ClipboardList className="w-5 h-5" />, href: '/candidates' },
      { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-5 h-5" />, href: '/reports' },
      { id: 'statistiken', label: 'Statistiken', icon: <BarChart3 className="w-5 h-5" />, href: '/statistiken' },
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
  onClose?: () => void;
}

export function AppSidebar({ role, userName, onClose }: AppSidebarProps) {
  const groups = getGroupsForRole(role);
  const initial = userName.charAt(0).toUpperCase();
  const isInternal = role === 'admin' || role === 'employee';

  const bottomItems = isInternal
    ? [profileItem, settingsItem, logoutItem]
    : [settingsItem, logoutItem];

  return (
    <Sidebar
      brand={isInternal ? 'Z' : initial}
      brandLabel={isInternal ? 'Zoepp Media' : userName}
      brandSub={role === 'admin' ? 'Admin' : role === 'employee' ? 'Mitarbeiter' : undefined}
      groups={groups}
      bottomItems={bottomItems}
      promo={<InstallPromo />}
      onClose={onClose}
    />
  );
}
