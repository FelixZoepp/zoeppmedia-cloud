'use client';

import {
  LogIn,
  Phone,
  ArrowRight,
  StickyNote,
  CheckCircle,
  XCircle,
  Mic,
  UserCheck,
  ClipboardList,
  Megaphone,
  UserPlus,
  Mail,
  ListChecks,
  Activity,
} from 'lucide-react';
import type { ActivityActionType, ActivityLogEntry } from '@/lib/types/database';

/* ── Helpers ─────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const iconMap: Record<ActivityActionType, React.ReactNode> = {
  login: <LogIn className="w-4 h-4" />,
  call: <Phone className="w-4 h-4" />,
  stage_change: <ArrowRight className="w-4 h-4" />,
  note: <StickyNote className="w-4 h-4" />,
  content_approval: <CheckCircle className="w-4 h-4" />,
  content_rejection: <XCircle className="w-4 h-4" />,
  recording_upload: <Mic className="w-4 h-4" />,
  onboarding_complete: <UserCheck className="w-4 h-4" />,
  survey_submitted: <ClipboardList className="w-4 h-4" />,
  funnel_published: <Megaphone className="w-4 h-4" />,
  candidate_created: <UserPlus className="w-4 h-4" />,
  invite_sent: <Mail className="w-4 h-4" />,
  email_sent: <Mail className="w-4 h-4" />,
  task_completed: <ListChecks className="w-4 h-4" />,
  other: <Activity className="w-4 h-4" />,
};

const colorMap: Record<ActivityActionType, string> = {
  login: 'bg-blue-50 text-blue-600',
  call: 'bg-red-50 text-red-600',
  stage_change: 'bg-purple-50 text-purple-600',
  note: 'bg-yellow-50 text-yellow-600',
  content_approval: 'bg-green-50 text-green-600',
  content_rejection: 'bg-red-50 text-red-600',
  recording_upload: 'bg-indigo-50 text-indigo-600',
  onboarding_complete: 'bg-green-50 text-green-700',
  survey_submitted: 'bg-gray-100 text-gray-600',
  funnel_published: 'bg-orange-50 text-orange-600',
  candidate_created: 'bg-teal-50 text-teal-600',
  invite_sent: 'bg-blue-50 text-blue-600',
  email_sent: 'bg-blue-50 text-blue-600',
  task_completed: 'bg-green-50 text-green-600',
  other: 'bg-gray-100 text-gray-500',
};

/* ── Types ───────────────────────────────────────────────── */

type ActivityEntryWithUser = ActivityLogEntry & {
  user?: { name: string } | null;
};

interface ActivityFeedProps {
  entries: ActivityEntryWithUser[];
  compact?: boolean;
  emptyText?: string;
}

/* ── Component ───────────────────────────────────────────── */

export function ActivityFeed({
  entries,
  compact = false,
  emptyText = 'Keine Aktivitäten vorhanden.',
}: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-2">{emptyText}</p>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {entries.map((entry, i) => {
        const icon = iconMap[entry.action_type] ?? iconMap.other;
        const color = colorMap[entry.action_type] ?? colorMap.other;
        const userName = entry.user?.name ?? null;

        return (
          <div key={entry.id} className="relative flex items-start gap-3">
            {/* Connector line */}
            {!compact && i < entries.length - 1 && (
              <div className="absolute left-[17px] top-[30px] w-px h-[calc(100%-8px)] bg-gray-100" />
            )}

            {/* Icon bubble */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              {icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-1">
              <p className={`text-sm font-medium text-gray-900 ${compact ? 'truncate' : ''}`}>
                {entry.action}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-400">{timeAgo(entry.created_at)}</span>
                {userName && (
                  <span className="text-xs text-gray-400">· {userName}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
