'use client';

import { Sidebar, type SidebarItem } from '@/components/ui/sidebar';
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
} from 'lucide-react';

const adminItems: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin' },
  { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
  { id: 'team', label: 'Team', icon: <Users className="w-5 h-5" />, href: '/team' },
  { id: 'tasks', label: 'Aufgaben', icon: <ListTodo className="w-5 h-5" />, href: '/tasks' },
  { id: 'funnels', label: 'Funnels', icon: <FolderKanban className="w-5 h-5" />, href: '/funnels' },
  { id: 'masterclass', label: 'Masterclass', icon: <GraduationCap className="w-5 h-5" />, href: '/admin/masterclass' },
  { id: 'ai-tools', label: 'AI Tools', icon: <Sparkles className="w-5 h-5" />, href: '/ai-tools' },
  { id: 'invites', label: 'Einladungen', icon: <UserPlus className="w-5 h-5" />, href: '/invites' },
];

const employeeItems: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, href: '/dashboard' },
  { id: 'clients', label: 'Kunden', icon: <Building2 className="w-5 h-5" />, href: '/clients' },
  { id: 'tasks', label: 'Aufgaben', icon: <ListTodo className="w-5 h-5" />, href: '/tasks' },
  { id: 'ai-tools', label: 'AI Tools', icon: <Sparkles className="w-5 h-5" />, href: '/ai-tools' },
  { id: 'funnels', label: 'Funnels', icon: <FolderKanban className="w-5 h-5" />, href: '/funnels' },
];

const agencyItems: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, href: '/dashboard' },
  { id: 'candidates', label: 'Bewerber', icon: <ClipboardList className="w-5 h-5" />, href: '/candidates' },
  { id: 'masterclass', label: 'Masterclass', icon: <GraduationCap className="w-5 h-5" />, href: '/masterclass' },
  { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-5 h-5" />, href: '/reports' },
];

const settingsItem: SidebarItem = {
  id: 'settings',
  label: 'Einstellungen',
  icon: <Settings className="w-5 h-5" />,
  href: '/settings',
};

function getItemsForRole(role: UserRole): SidebarItem[] {
  switch (role) {
    case 'admin': return adminItems;
    case 'employee': return employeeItems;
    case 'agency_owner':
    case 'agency_member':
      return agencyItems;
  }
}

interface AppSidebarProps {
  role: UserRole;
  userName: string;
}

export function AppSidebar({ role, userName }: AppSidebarProps) {
  const items = getItemsForRole(role);
  const initial = userName.charAt(0).toUpperCase();

  return (
    <Sidebar
      brand={initial}
      brandLabel={userName}
      items={items}
      bottomItems={[settingsItem]}
    />
  );
}
