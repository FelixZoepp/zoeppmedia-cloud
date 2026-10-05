'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowUpRight, Briefcase, CalendarClock, Check, Copy, Mail, MapPin, MessageCircle, Pencil, Phone, Sparkles, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { formatPhone, isNewFromWhatsApp, type InboxConversation, type InboxKind } from './format';

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
  kind?: InboxKind;
  /** Nach Umbenennen o. Ä. Liste neu laden */
  onChanged?: () => void;
  onClose?: () => void;
}

export function CandidateSidebar({ conversation, kind = 'recruiting', onChanged, onClose }: Props) {
  const conv = conversation as unknown as InboxConversation;
  const candidate = conv.candidate;
  const app = conv.application?.[0];
  const stage = candidate.current_stage ?? app?.stage ?? null;
  const neu = isNewFromWhatsApp(candidate);
  const kontaktWort = kind === 'sales' ? 'Lead' : 'Bewerber';

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>(conv.assigned_to ?? '');
  const [assigning, setAssigning] = useState(false);
  const [nextAppointment, setNextAppointment] = useState<NextAppointment | null>(null);
  const [editName, setEditName] = useState(false);
  const [nameValue, setNameValue] = useState(candidate.name);
  const [copied, setCopied] = useState(false);

  // Werte zurücksetzen, wenn eine andere Konversation gewählt wird
  const [lastId, setLastId] = useState(conv.id);
  if (lastId !== conv.id) {
    setLastId(conv.id);
    setAssignedTo(conv.assigned_to ?? '');
    setNameValue(candidate.name);
    setEditName(false);
  }

  useEffect(() => {
    fetch('/api/team/members')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TeamMember[]) => setMembers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const appId = conv.application?.[0]?.id;
    let cancelled = false;
    if (!appId) {
      Promise.resolve().then(() => !cancelled && setNextAppointment(null));
      return () => {
        cancelled = true;
      };
    }
    fetch(`/api/applications/${appId}/appointments`)
      .then((r) => (r.ok ? r.json() : { appointments: [] }))
      .then((data: { appointments?: NextAppointment[] }) => {
        if (cancelled) return;
        const upcoming = (data.appointments ?? [])
          .filter((a) => (a.status === 'booked' || a.status === 'confirmed') && a.starts_at && new Date(a.starts_at).getTime() > Date.now())
          .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime());
        setNextAppointment(upcoming[0] ?? null);
      })
      .catch(() => !cancelled && setNextAppointment(null));
    return () => {
      cancelled = true;
    };
  }, [conv.id, conv.application]);

  async function handleAssign(userId: string) {
    setAssigning(true);
    const previous = assignedTo;
    setAssignedTo(userId);
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
      } else {
        onChanged?.();
      }
    } catch {
      setAssignedTo(previous);
      toast.error('Zuweisung fehlgeschlagen');
    } finally {
      setAssigning(false);
    }
  }

  async function saveName() {
    const res = await fetch(`/api/conversations/${conv.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameValue }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(result.error || 'Name konnte nicht gespeichert werden');
      return;
    }
    toast.success('Name gespeichert');
    setEditName(false);
    onChanged?.();
  }

  async function copyPhone() {
    if (!candidate.phone_e164) return;
    await navigator.clipboard.writeText(candidate.phone_e164);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const waLink = candidate.phone_e164 ? `https://wa.me/${candidate.phone_e164.replace(/^\+/, '')}` : null;

  return (
    <div className="space-y-4 p-4">
      {onClose && (
        <button onClick={onClose} className="ml-auto grid h-9 w-9 place-items-center rounded-full hover:bg-panel xl:hidden" aria-label="Kontakt schließen">
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Kopf */}
      <div className="flex flex-col items-center pt-2 text-center">
        <Avatar name={candidate.name} size={84} />
        {editName ? (
          <div className="mt-3 flex w-full items-center gap-2">
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              autoFocus
              className="h-10 min-w-0 flex-1 rounded-[12px] bg-panel px-3 text-[15px] outline-none focus-visible:shadow-[var(--focus)]"
            />
            <button onClick={saveName} className="grid h-10 w-10 place-items-center rounded-full bg-red-950 text-red-50" aria-label="Speichern">
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button onClick={() => setEditName(true)} className="group mt-3 inline-flex items-center gap-1.5 text-[19px] font-medium tracking-[-0.02em]">
            {candidate.name}
            <Pencil className="h-3.5 w-3.5 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <p className="text-[14px] text-gray-600">{formatPhone(candidate.phone_e164) || 'Keine Nummer'}</p>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          {neu ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              <Sparkles className="h-3 w-3" /> Neu aus WhatsApp
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
              <Check className="h-3 w-3" /> Im CRM als {kontaktWort}
            </span>
          )}
          {stage && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-xs font-medium text-gray-700">
              <span className="h-2 w-2 rounded-full" style={{ background: stage.color || '#a69f9b' }} />
              {stage.name}
            </span>
          )}
        </div>
        {neu && (
          <p className="mt-3 rounded-[12px] bg-amber-50 px-3 py-2 text-left text-[12.5px] leading-snug text-amber-900">
            Diese Nummer war noch nicht im CRM und wurde automatisch als {kontaktWort} angelegt. Name prüfen und ggf. anpassen.
          </p>
        )}
      </div>

      {/* Schnellaktionen */}
      {candidate.phone_e164 && (
        <div className="grid grid-cols-3 gap-2">
          <a href={`tel:${candidate.phone_e164}`} className="flex flex-col items-center gap-1 rounded-[14px] bg-panel py-2.5 text-[12px] font-medium hover:bg-gray-100">
            <Phone className="h-[18px] w-[18px] text-red-800" /> Anrufen
          </a>
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-[14px] bg-panel py-2.5 text-[12px] font-medium hover:bg-gray-100">
              <MessageCircle className="h-[18px] w-[18px] text-red-800" /> WhatsApp
            </a>
          )}
          <button onClick={copyPhone} className="flex flex-col items-center gap-1 rounded-[14px] bg-panel py-2.5 text-[12px] font-medium hover:bg-gray-100">
            {copied ? <Check className="h-[18px] w-[18px] text-green-700" /> : <Copy className="h-[18px] w-[18px] text-red-800" />}
            {copied ? 'Kopiert' : 'Nummer'}
          </button>
        </div>
      )}

      {/* CRM-Daten */}
      <section className="rounded-[16px] p-4 shadow-[inset_0_0_0_1.5px_var(--hair)]">
        <h4 className="text-xs font-medium uppercase tracking-[0.06em] text-gray-500">{kind === 'sales' ? 'Lead im CRM' : 'Bewerber im CRM'}</h4>
        <ul className="mt-3 space-y-2.5 text-[14px]">
          {candidate.email && (
            <li className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 flex-none text-gray-500" />
              <a href={`mailto:${candidate.email}`} className="min-w-0 truncate hover:text-red-800">{candidate.email}</a>
            </li>
          )}
          {app?.job && (
            <li className="flex items-center gap-2.5">
              <Briefcase className="h-4 w-4 flex-none text-gray-500" />
              <span className="min-w-0 truncate">{app.job.title}</span>
            </li>
          )}
          {candidate.location && (
            <li className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4 flex-none text-gray-500" />
              <span className="min-w-0 truncate">{candidate.location}</span>
            </li>
          )}
          {nextAppointment?.starts_at && (
            <li className="flex items-center gap-2.5">
              <CalendarClock className="h-4 w-4 flex-none text-gray-500" />
              <span>
                {new Date(nextAppointment.starts_at).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}{' '}
                {new Date(nextAppointment.starts_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                {nextAppointment.type === 'video' ? 'Video' : nextAppointment.type === 'onsite' ? 'Vor Ort' : 'Telefon'}
              </span>
            </li>
          )}
          {candidate.created_at && (
            <li className="text-[13px] text-gray-500">
              Im CRM seit {new Date(candidate.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
            </li>
          )}
        </ul>
        {kind === 'recruiting' && (
          <Link href={`/candidates/${candidate.id}`} className="mt-3.5 inline-flex items-center gap-1 text-[14px] font-medium text-red-800 hover:underline">
            Bewerberprofil öffnen <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </section>

      {/* Zuweisung */}
      <section className="rounded-[16px] p-4 shadow-[inset_0_0_0_1.5px_var(--hair)]">
        <h4 className="text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Zuständig</h4>
        <div className="mt-3 flex items-center gap-2.5">
          {assignedTo && members.find((m) => m.id === assignedTo) ? (
            <Avatar name={members.find((m) => m.id === assignedTo)!.name} size={34} />
          ) : (
            <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-panel text-gray-400">?</span>
          )}
          <select
            className="h-10 min-w-0 flex-1 rounded-[12px] bg-panel px-3 text-[14px] outline-none focus-visible:shadow-[var(--focus)] disabled:opacity-50"
            value={assignedTo}
            onChange={(e) => handleAssign(e.target.value)}
            disabled={assigning || members.length === 0}
          >
            <option value="">Nicht zugewiesen</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}
