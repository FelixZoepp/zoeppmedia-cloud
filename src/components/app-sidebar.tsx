'use client';

import { Sidebar, type SidebarGroup, type SidebarItem } from '@/components/ui/sidebar';
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
  ListTodo,
  ListChecks,
  Target,
  BookOpen,
  FileText,
  UserCircle,
  LogOut,
  Megaphone,
  Handshake,
  BarChart3 as ChartBar,
  CalendarDays,
  CalendarCheck,
  Timer,
  Shield,
  CheckSquare,
  FileBarChart,
  Activity,
} from 'lucide-react';

const adminGroups: SidebarGroup[] = [
  {
    label: 'Cockpit',
    items: [
      { id: 'heute', label: 'Heute', icon: <CalendarCheck className="w-5 h-5" />, href: '/heute' },
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin' },
      { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
      { id: 'team', label: 'Team', icon: <Users className="w-5 h-5" />, href: '/team' },
    ],
  },
  {
    label: 'Fulfillment',
    items: [
      { id: 'aufgaben', label: 'Aufgaben', icon: <ClipboardList className="w-5 h-5" />, href: '/aufgaben' },
      { id: 'tasks', label: 'Interne Tasks', icon: <ListTodo className="w-5 h-5" />, href: '/tasks' },
      { id: 'funnels', label: 'Funnels', icon: <FolderKanban className="w-5 h-5" />, href: '/funnels' },
      { id: 'ai-tools', label: 'AI Tools', icon: <Sparkles className="w-5 h-5" />, href: '/ai-tools' },
      { id: 'playbook', label: 'Playbook', icon: <BookOpen className="w-5 h-5" />, href: '/playbook' },
    ],
  },
  {
    label: 'Marketing & Sales',
    items: [
      { id: 'marketing', label: 'Meta Ads', icon: <Megaphone className="w-5 h-5" />, href: '/admin/marketing' },
      { id: 'sales', label: 'Sales Pipeline', icon: <Handshake className="w-5 h-5" />, href: '/admin/sales' },
      { id: 'report', label: 'Funnel Report', icon: <ChartBar className="w-5 h-5" />, href: '/admin/report' },
      { id: 'ttfc', label: 'Speed-to-Lead', icon: <Timer className="w-5 h-5" />, href: '/admin/ttfc' },
      { id: 'wochenbericht', label: 'Wochenbericht', icon: <CalendarDays className="w-5 h-5" />, href: '/admin/wochenbericht' },
    ],
  },
  {
    label: 'Verwaltung',
    items: [
      { id: 'freigaben', label: 'Freigaben', icon: <CheckSquare className="w-5 h-5" />, href: '/admin/freigaben' },
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
      { id: 'aufgaben', label: 'Aufgaben', icon: <ClipboardList className="w-5 h-5" />, href: '/aufgaben' },
      { id: 'meine-aufgaben', label: 'Meine Aufgaben (alt)', icon: <ListTodo className="w-5 h-5" />, href: '/meine-aufgaben' },
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
      { id: 'tasks', label: 'Interne Tasks', icon: <ListTodo className="w-5 h-5" />, href: '/tasks' },
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
      { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-5 h-5" />, href: '/reports' },
    ],
  },
  {
    label: 'Zusammenarbeit',
    items: [
      { id: 'status', label: 'Projektstatus', icon: <ListChecks className="w-5 h-5" />, href: '/status' },
      { id: 'masterclass', label: 'Masterclass', icon: <GraduationCap className="w-5 h-5" />, href: '/masterclass' },
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
      return agencyGroups;
  }
}

interface AppSidebarProps {
  role: UserRole;
  userName: string;
}

export function AppSidebar({ role, userName }: AppSidebarProps) {
  const groups = getGroupsForRole(role);
  const initial = userName.charAt(0).toUpperCase();
  const isInternal = role === 'admin' || role === 'employee';

  const bottomItems = isInternal
    ? [profileItem, settingsItem, logoutItem]
    : [settingsItem, logoutItem];

  return (
    <Sidebar
      brand={initial}
      brandLabel={isInternal ? 'Zoepp Media' : userName}
      brandSub={role === 'admin' ? 'Admin' : role === 'employee' ? 'Mitarbeiter' : undefined}
      groups={groups}
      bottomItems={bottomItems}
    />
  );
}
