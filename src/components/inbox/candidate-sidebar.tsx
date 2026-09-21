'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, Briefcase, User, UserCircle, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface NextAppointment {
  id: string;
  starts_at: string | null;
  type: string;
  status: string;
}

interface Props {
  conversation: Record<string, unknown>;
}

export function CandidateSidebar({ conversation }: Props) {
  const conv = conversation as {
    id: string;
    candidate: {
      id: string;
      name: string;
      phone_e164: string | null;
      email: string | null;
    };
    application: Array<{
      id: string;
      job: { title: string } | null;
      stage: { name: string; color: string } | null;
    }> | null;
    state: string;
    assigned_to: string | null;
  };

  const candidate = conv.candidate;
  const app = conv.application?.[0];

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>(conv.assigned_to ?? '');
  const [assigning, setAssigning] = useState(false);
  const [nextAppointment, setNextAppointment] = useState<NextAppointment | null>(null);

  // Sync assignedTo wenn conversation von außen wechselt
  useEffect(() => {
    setAssignedTo(conv.assigned_to ?? '');
  }, [conv.id, conv.assigned_to]);

  // Team-Mitglieder laden
  useEffect(() => {
    fetch('/api/team/members')
      .then(r => r.ok ? r.json() : [])
      .then((data: TeamMember[]) => setMembers(data))
      .catch(() => {});
  }, []);

  // Nächsten Termin laden (gebucht/bestätigt, in der Zukunft)
  useEffect(() => {
    const appId = conv.application?.[0]?.id;
    if (!appId) {
      setNextAppointment(null);
      return;
    }
    fetch(`/api/applications/${appId}/appointments`)
      .then(r => (r.ok ? r.json() : { appointments: [] }))
      .then((data: { appointments?: NextAppointment[] }) => {
        const upcoming = (data.appointments ?? [])
          .filter(a =>
            (a.status === 'booked' || a.status === 'confirmed') &&
            a.starts_at &&
            new Date(a.starts_at).getTime() > Date.now()
          )
          .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime());
        setNextAppointment(upcoming[0] ?? null);
      })
      .catch(err => {
        console.error('[CandidateSidebar] Fehler beim Laden des nächsten Termins', err);
        setNextAppointment(null);
      });
  }, [conv.id, conv.application]);

  async function handleAssign(userId: string) {
    setAssigning(true);
    const previous = assignedTo;
    setAssignedTo(userId); // optimistisch
    try {
      const res = await fetch(`/api/conversations/${conv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: userId || null }),
      });
      const result = await res.json();
      if (!result.ok) {
        setAssignedTo(previous);
        toast.error(result.error || 'Zuweisung fehlgeschlagen');
      }
    } catch {
      setAssignedTo(previous);
      toast.error('Zuweisung fehlgeschlagen');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* Name + Link */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <User className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <Link
            href={`/candidates/${candidate.id}`}
            className="text-sm font-semibold text-gray-900 hover:underline"
          >
            {candidate.name}
          </Link>
        </div>
      </div>

      {/* Kontakt */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase">Kontakt</h4>
        {candidate.phone_e164 && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Phone className="w-4 h-4 text-gray-400" />
            <span>{candidate.phone_e164}</span>
          </div>
        )}
        {candidate.email && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Mail className="w-4 h-4 text-gray-400" />
            <span>{candidate.email}</span>
          </div>
        )}
      </div>

      {/* Job + Stufe */}
      {app && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase">Bewerbung</h4>
          {app.job && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Briefcase className="w-4 h-4 text-gray-400" />
              <span>{app.job.title}</span>
            </div>
          )}
          {app.stage && (
            <Badge>{app.stage.name}</Badge>
          )}
        </div>
      )}

      {/* Nächster Termin */}
      {nextAppointment && nextAppointment.starts_at && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase">Nächster Termin</h4>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <CalendarClock className="w-4 h-4 text-gray-400" />
            <span>
              {new Date(nextAppointment.starts_at).toLocaleDateString('de-DE', {
                weekday: 'short', day: '2-digit', month: '2-digit',
              })}{' '}
              {new Date(nextAppointment.starts_at).toLocaleTimeString('de-DE', {
                hour: '2-digit', minute: '2-digit',
              })}
              {' · '}
              {nextAppointment.type === 'video' ? 'Video' : nextAppointment.type === 'onsite' ? 'Vor Ort' : 'Telefon'}
            </span>
          </div>
        </div>
      )}

      {/* Zuweisung */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase">Zugewiesen an</h4>
        <div className="flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <select
            className="flex-1 text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-50"
            value={assignedTo}
            onChange={e => handleAssign(e.target.value)}
            disabled={assigning || members.length === 0}
          >
            <option value="">— Nicht zugewiesen —</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
