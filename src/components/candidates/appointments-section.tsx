'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarClock, Plus, Check, X, Ban, BellRing, Pencil } from 'lucide-react';

interface Appointment {
  id: string;
  candidate_id: string;
  agency_id: string;
  type: 'vorstellungsgespraech' | 'probetag';
  scheduled_at: string;
  status: 'geplant' | 'erschienen' | 'no_show' | 'abgesagt';
  reminder_done_at: string | null;
  notes: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<Appointment['type'], string> = {
  vorstellungsgespraech: 'Vorstellungsgespräch',
  probetag: 'Probetag',
};

const STATUS_BADGE: Record<Appointment['status'], { label: string; tone: 'success' | 'neutral' | 'accent' | 'softAccent' }> = {
  geplant: { label: 'Geplant', tone: 'softAccent' },
  erschienen: { label: 'Erschienen', tone: 'success' },
  no_show: { label: 'No-Show', tone: 'accent' },
  abgesagt: { label: 'Abgesagt', tone: 'neutral' },
};

export function AppointmentsSection({ candidateId }: { candidateId: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<Appointment['type']>('vorstellungsgespraech');
  const [newAt, setNewAt] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/appointments`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setAppointments(data);
      }
    } catch {
      // ignorieren — Sektion bleibt leer
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createAppointment() {
    if (!newAt) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/candidates/${candidateId}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newType,
          scheduled_at: new Date(newAt).toISOString(),
          notes: newNotes || null,
        }),
      });
      if (!res.ok) throw new Error('Termin konnte nicht angelegt werden');
      const created = await res.json().catch(() => null);
      setInfo(
        created?.confirmation_sent
          ? 'Termin angelegt — Bestätigungs-Mail wurde an den Bewerber gesendet.'
          : 'Termin angelegt. Keine Bestätigungs-Mail möglich (keine E-Mail-Adresse hinterlegt).'
      );
      setShowForm(false);
      setNewAt('');
      setNewNotes('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  async function reschedule(id: string) {
    if (!rescheduleAt) return;
    setUpdating(id);
    setError('');
    try {
      const iso = new Date(rescheduleAt).toISOString();
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: iso }),
      });
      if (!res.ok) throw new Error('Termin konnte nicht verschoben werden');
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, scheduled_at: iso } : a)));
      setInfo('Termin verschoben — Bewerber und Kunde wurden per Mail informiert, Kalender aktualisiert sich automatisch.');
      setRescheduling(null);
      setRescheduleAt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setUpdating(null);
    }
  }

  async function setStatus(id: string, status: Appointment['status']) {
    setUpdating(id);
    setError('');
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Status konnte nicht gespeichert werden');
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      if (status === 'no_show') {
        const json = await res.json().catch(() => null);
        if (typeof json?.noshow_points === 'number') {
          setInfo(
            json.noshow_points >= 3
              ? `No-Show erfasst — ${json.noshow_points} Punkte, Bewerber wurde automatisch gesperrt.`
              : `No-Show erfasst — Bewerber hat jetzt ${json.noshow_points} No-Show-Punkt${json.noshow_points === 1 ? '' : 'e'} (Sperre ab 3).`
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setUpdating(null);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-4">
        <CalendarClock className="w-4 h-4 text-gray-600" />
        <h2 className="text-sm font-semibold text-gray-900">VG & Probetage</h2>
        {appointments.length > 0 && <Badge tone="neutral">{appointments.length}</Badge>}
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Termin
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as Appointment['type'])}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
            >
              <option value="vorstellungsgespraech">Vorstellungsgespräch</option>
              <option value="probetag">Probetag</option>
            </select>
            <input
              type="datetime-local"
              value={newAt}
              onChange={(e) => setNewAt(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Notiz (optional)…"
              className="flex-1 min-w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none bg-white"
            />
            <Button variant="primary" size="md" disabled={!newAt || saving} onClick={createAppointment}>
              {saving ? 'Speichern…' : 'Anlegen'}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Der Bewerber erhält automatisch eine Bestätigungs-Mail. Der Termin erscheint im
            verbundenen Kalender des Kunden. Der Innendienst erinnert den Bewerber in den 24h vor dem Termin.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      {info && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
          {info}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      ) : appointments.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-3">Noch keine Termine</p>
      ) : (
        <div className="space-y-2">
          {appointments.map((appt) => {
            const sb = STATUS_BADGE[appt.status];
            const date = new Date(appt.scheduled_at);
            const isPast = date.getTime() < Date.now();
            return (
              <div key={appt.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <CalendarClock className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{TYPE_LABELS[appt.type]}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                      {date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                      {appt.reminder_done_at && (
                        <span className="inline-flex items-center gap-1 ml-2 text-green-700 font-medium">
                          <BellRing className="w-3 h-3" />
                          Erinnert
                        </span>
                      )}
                    </p>
                    {appt.notes && <p className="text-xs text-gray-500 mt-0.5">Notiz: {appt.notes}</p>}
                  </div>
                  <Badge tone={sb.tone}>{sb.label}</Badge>
                </div>

                {appt.status === 'geplant' && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {isPast && (
                      <span className="text-xs text-amber-600 font-medium mr-1">Wie gelaufen?</span>
                    )}
                    <button
                      onClick={() => setStatus(appt.id, 'erschienen')}
                      disabled={updating === appt.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Erschienen
                    </button>
                    <button
                      onClick={() => setStatus(appt.id, 'no_show')}
                      disabled={updating === appt.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      No-Show
                    </button>
                    <button
                      onClick={() => setStatus(appt.id, 'abgesagt')}
                      disabled={updating === appt.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Abgesagt
                    </button>
                    <button
                      onClick={() => {
                        setRescheduling((v) => (v === appt.id ? null : appt.id));
                        setRescheduleAt('');
                      }}
                      disabled={updating === appt.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Verschieben
                    </button>
                  </div>
                )}

                {appt.status === 'geplant' && rescheduling === appt.id && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <input
                      type="datetime-local"
                      value={rescheduleAt}
                      onChange={(e) => setRescheduleAt(e.target.value)}
                      className="h-9 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!rescheduleAt || updating === appt.id}
                      onClick={() => reschedule(appt.id)}
                    >
                      {updating === appt.id ? 'Speichern…' : 'Neuen Termin speichern'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
