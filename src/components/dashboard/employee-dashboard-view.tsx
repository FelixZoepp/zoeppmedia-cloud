'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Users, ClipboardList, RefreshCw, Calendar, ArrowRight, BookOpen, CheckCircle, CalendarCheck, ExternalLink, Zap } from 'lucide-react';
import type { PlaybookTask, CalendlyEvent } from '@/lib/types/database';

interface Agency {
  id: string;
  name: string;
  contact_name: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  agency_id: string | null;
  agency_name: string | null;
  status: string;
  priority: string;
  due_date: string | null;
}

interface FulfillmentTask {
  id: string;
  agency_id: string;
  task_key: string;
  title: string;
  status: string;
  due_date: string | null;
  agency_name: string;
}

interface DashboardData {
  user: { name: string; role: string; position: string | null; calendly_link: string | null };
  agencies: Agency[];
  tasks: Task[];
  fulfillmentTasks: FulfillmentTask[];
}

const priorityBadge: Record<string, { label: string; tone: 'accent' | 'softAccent' | 'neutral' | 'success' | 'outline' }> = {
  urgent: { label: 'Dringend', tone: 'accent' },
  high: { label: 'Hoch', tone: 'softAccent' },
  medium: { label: 'Mittel', tone: 'neutral' },
  low: { label: 'Niedrig', tone: 'outline' },
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 18) return 'Guten Nachmittag';
  return 'Guten Abend';
}

export function EmployeeDashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [playbookTasks, setPlaybookTasks] = useState<PlaybookTask[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendlyEvent[]>([]);

  useEffect(() => {
    fetch('/api/employee/dashboard')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    fetch('/api/playbook-tasks?status=pending')
      .then((r) => r.ok ? r.json() : [])
      .then((pending: PlaybookTask[]) => {
        fetch('/api/playbook-tasks?status=in_progress')
          .then((r) => r.ok ? r.json() : [])
          .then((inProgress: PlaybookTask[]) => {
            setPlaybookTasks([...inProgress, ...pending]);
          })
          .catch(() => {});
      })
      .catch(() => {});

    // Fetch upcoming Calendly events (today + tomorrow)
    const now = new Date();
    const dayAfterTomorrow = new Date(now);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    dayAfterTomorrow.setHours(0, 0, 0, 0);

    fetch(`/api/calendly/events?from=${now.toISOString()}&to=${dayAfterTomorrow.toISOString()}&status=scheduled&limit=20`)
      .then((r) => r.ok ? r.json() : [])
      .then((events: CalendlyEvent[]) => {
        if (Array.isArray(events)) setUpcomingEvents(events);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-gray-400">Daten konnten nicht geladen werden.</p>;
  }

  const firstName = data.user.name.split(' ')[0];

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Greeting */}
      <div>
        <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
          Dashboard
        </span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mt-2">
          {getGreeting()}, {firstName}.
        </h1>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {data.user.position && (
            <span className="text-sm text-gray-500">{data.user.position}</span>
          )}
          {data.user.calendly_link && (
            <a
              href={data.user.calendly_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Calendly
            </a>
          )}
        </div>
      </div>

      {/* Quick link: Meine Aufgaben */}
      <div>
        <Link href="/meine-aufgaben">
          <Card
            padding="md"
            className="flex items-center justify-between hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-red-100 bg-red-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Aufgaben abarbeiten</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.fulfillmentTasks.length + playbookTasks.length} offene Aufgaben insgesamt
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-red-600 shrink-0" />
          </Card>
        </Link>
      </div>

      {/* Anstehende Termine */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-gray-900">Anstehende Termine</h2>
          <span className="text-sm text-gray-400 ml-1">{upcomingEvents.length}</span>
        </div>
        {upcomingEvents.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center">Keine Termine heute und morgen.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((evt) => {
              const startDate = new Date(evt.start_time);
              const endDate = evt.end_time ? new Date(evt.end_time) : null;
              const isToday = startDate.toDateString() === new Date().toDateString();

              return (
                <Card key={evt.id} padding="sm">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {evt.invitee_name || evt.event_name || 'Termin'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {evt.event_name && evt.invitee_name ? evt.event_name : ''}
                        {evt.invitee_email ? ` \u00B7 ${evt.invitee_email}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge tone={isToday ? 'softAccent' : 'neutral'}>
                        {isToday ? 'Heute' : 'Morgen'}
                      </Badge>
                      <p className="text-xs font-medium text-gray-700 mt-1">
                        {startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        {endDate && (
                          <>
                            {' '}&ndash;{' '}
                            {endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Meine Kunden */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-gray-900">Meine Kunden</h2>
          <span className="text-sm text-gray-400 ml-1">{data.agencies.length}</span>
        </div>
        {data.agencies.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center">Noch keine Kunden zugewiesen.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.agencies.map((agency) => (
              <Link key={agency.id} href={`/clients/${agency.id}`}>
                <Card padding="md" className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-8 h-8 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {agency.name.charAt(0)}
                        </span>
                        <p className="text-sm font-semibold text-gray-900">{agency.name}</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{agency.contact_name} &middot; {agency.email}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Offene Aufgaben */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-gray-900">Offene Aufgaben</h2>
          <span className="text-sm text-gray-400 ml-1">{data.tasks.length}</span>
        </div>
        {data.tasks.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center">Keine offenen Aufgaben.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.tasks.map((task) => {
              const pb = priorityBadge[task.priority] ?? priorityBadge.medium;
              return (
                <Card key={task.id} padding="sm">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{task.title}</p>
                      {task.agency_name && (
                        <p className="text-xs text-gray-400 mt-0.5">{task.agency_name}</p>
                      )}
                    </div>
                    <Badge tone={pb.tone}>{pb.label}</Badge>
                    {task.due_date && (
                      <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                        <Calendar className="w-3 h-3" />
                        {new Date(task.due_date).toLocaleDateString('de-DE')}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Anstehende Fulfillment */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-gray-900">Anstehende Fulfillment</h2>
          <span className="text-sm text-gray-400 ml-1">{data.fulfillmentTasks.length}</span>
        </div>
        {data.fulfillmentTasks.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center">Keine anstehenden Fulfillment-Aufgaben.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.fulfillmentTasks.map((task) => (
              <Card key={task.id} padding="sm">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{task.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{task.agency_name}</p>
                  </div>
                  <Badge tone="neutral">{task.task_key}</Badge>
                  {task.due_date && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                      <Calendar className="w-3 h-3" />
                      {new Date(task.due_date).toLocaleDateString('de-DE')}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Playbook Aufgaben */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-gray-900">Playbook Aufgaben</h2>
          <span className="text-sm text-gray-400 ml-1">{playbookTasks.length}</span>
        </div>
        {playbookTasks.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center">Keine offenen Playbook-Aufgaben.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {playbookTasks.slice(0, 10).map((task) => (
              <Card key={task.id} padding="sm">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{task.action_text}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge tone="softAccent" className="text-xs !px-2 !py-0.5 font-mono">
                        {task.playbook_key}
                      </Badge>
                      <Badge
                        tone={task.status === 'in_progress' ? 'accent' : 'neutral'}
                        className="text-xs !px-2 !py-0.5"
                      >
                        {task.status === 'in_progress' ? 'In Bearbeitung' : 'Offen'}
                      </Badge>
                    </div>
                  </div>
                  <CheckCircle className="w-4 h-4 text-gray-200 shrink-0" />
                </div>
              </Card>
            ))}
            {playbookTasks.length > 10 && (
              <Link href="/playbook">
                <p className="text-xs text-red-600 hover:underline text-center pt-1">
                  Alle {playbookTasks.length} Aufgaben ansehen
                </p>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
