'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  UserPlus,
  ArrowRightLeft,
  Phone,
  ClipboardList,
  Clock,
  AlertTriangle,
  UserX,
  Ban,
  Info,
} from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  new_candidate: UserPlus,
  stage_change: ArrowRightLeft,
  call_result: Phone,
  task_assigned: ClipboardList,
  task_due: Clock,
  sla_breach: AlertTriangle,
  noshow: UserX,
  opt_out: Ban,
  system: Info,
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'gerade eben';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `vor ${diffHrs} Std`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `vor ${diffWeeks} ${diffWeeks === 1 ? 'Woche' : 'Wochen'}`;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      // Silently fail — notification polling should never break the UI
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  async function markAsRead(ids: string[]) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      setNotifications(prev =>
        prev.map(n => (ids.includes(n.id) ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - ids.length));
    } catch {
      // Silently fail
    }
  }

  async function markAllRead() {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  }

  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      markAsRead([notification.id]);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Benachrichtigungen"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-900">
              Benachrichtigungen
            </span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-600 text-white">
                {unreadCount}
              </span>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Keine Benachrichtigungen
              </div>
            ) : (
              notifications.map(notification => {
                const IconComponent = TYPE_ICONS[notification.type] || Bell;
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                      !notification.read ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <span className={`mt-0.5 flex-shrink-0 ${!notification.read ? 'text-red-500' : 'text-gray-400'}`}>
                      <IconComponent className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!notification.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {notification.body}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {formatRelativeTime(notification.created_at)}
                      </p>
                    </div>
                    {!notification.read && (
                      <span className="mt-2 w-2 h-2 rounded-full bg-red-600 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {unreadCount > 0 && (
            <div className="border-t border-gray-200 px-4 py-2">
              <button
                onClick={markAllRead}
                className="w-full text-center text-xs font-medium text-red-600 hover:text-red-700 py-1 transition-colors"
              >
                Alle gelesen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
