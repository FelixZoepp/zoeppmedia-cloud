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
} from 'lucide-react';

const adminGroups: SidebarGroup[] = [
  {
    label: 'Cockpit',
    items: [
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin' },
      { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
      { id: 'team', label: 'Team', icon: <Users className="w-5 h-5" />, href: '/team' },
    ],
  },
  {
    label: 'Fulfillment',
    items: [
      { id: 'tasks', label: 'Aufgaben', icon: <ListTodo className="w-5 h-5" />, href: '/tasks' },
      { id: 'funnels', label: 'Funnels', icon: <FolderKanban className="w-5 h-5" />, href: '/funnels' },
      { id: 'ai-tools', label: 'AI Tools', icon: <Sparkles className="w-5 h-5" />, href: '/ai-tools' },
      { id: 'playbook', label: 'Playbook', icon: <BookOpen className="w-5 h-5" />, href: '/playbook' },
    ],
  },
  {
    label: 'Verwaltung',
    items: [
      { id: 'masterclass', label: 'Masterclass', icon: <GraduationCap className="w-5 h-5" />, href: '/admin/masterclass' },
      { id: 'kpi', label: 'KPI Einstellungen', icon: <Target className="w-5 h-5" />, href: '/admin/kpi' },
      { id: 'templates', label: 'Templates', icon: <FileText className="w-5 h-5" />, href: '/admin/templates' },
      { id: 'invites', label: 'Einladungen', icon: <UserPlus className="w-5 h-5" />, href: '/invites' },
    ],
  },
];

const employeeGroups: SidebarGroup[] = [
  {
    label: 'Cockpit',
    items: [
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin' },
      { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
    ],
  },
  {
    label: 'Fulfillment',
    items: [
      { id: 'tasks', label: 'Aufgaben', icon: <ListTodo className="w-5 h-5" />, href: '/tasks' },
      { id: 'ai-tools', label: 'AI Tools', icon: <Sparkles className="w-5 h-5" />, href: '/ai-tools' },
      { id: 'funnels', label: 'Funnels', icon: <FolderKanban className="w-5 h-5" />, href: '/funnels' },
      { id: 'playbook', label: 'Playbook', icon: <BookOpen className="w-5 h-5" />, href: '/playbook' },
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

  return (
    <Sidebar
      brand={initial}
      brandLabel={isInternal ? 'Zoepp Media' : userName}
      brandSub={isInternal ? 'Admin' : undefined}
      groups={groups}
      bottomItems={[settingsItem]}
    />
  );
}
