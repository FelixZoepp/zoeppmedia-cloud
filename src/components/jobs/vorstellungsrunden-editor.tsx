'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, UserPlus, Check, X } from 'lucide-react';

interface Teilnehmer {
  appointment_id: string;
  candidate_id: string | null;
  name: string;
  telefon: string | null;
  status: string;
}

interface Runde {
  id: string;
  starts_at: string;
  ends_at: string;
  adresse: string;
  hinweis: string | null;
  max_teilnehmer: number;
  freie_plaetze: number;
  teilnehmer: Teilnehmer[];
}

const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' | 'softAccent' }> = {
  booked: { label: 'Gebucht – noch nicht bestätigt', tone: 'warning' },
  confirmed: { label: 'Bestätigt', tone: 'success' },
  done: { label: 'Erschienen', tone: 'success' },
  no_show: { label: 'No-Show', tone: 'danger' },
};

const morgen = () => {
  const d = new Date(Date.now() + 864e5);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Feste Termine einer Vorstellungsrunde anlegen und sehen, wer kommt */
export function VorstellungsrundenEditor({ jobId }: { jobId: string }) {
  const [runden, setRunden] = useState<Runde[]>([]);
  const [bewerbungen, setBewerbungen] = useState<Array<{ id: string; name: string }>>([]);
  const [migrationFehlt, setMigrationFehlt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ datum: morgen(), uhrzeit: '17:00', dauer: 60, adresse: '', max: 10, hinweis: '' });
  const [auswahl, setAuswahl] = useState<Record<string, string>>({});

  const [version, setVersion] = useState(0);
  const [jetzt, setJetzt] = useState(0);
  const laden = () => setVersion((v) => v + 1);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/jobs/${jobId}/vorstellungsrunden`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Laden fehlgeschlagen');
        if (!aktiv) return;
        setMigrationFehlt(!!data.migration_fehlt);
        setRunden(data.runden ?? []);
        setBewerbungen(data.bewerbungen ?? []);
        setJetzt(Date.now());
        if (data.standard_adresse) setForm((f) => (f.adresse ? f : { ...f, adresse: data.standard_adresse }));
      })
      .catch((err) => console.error('[Vorstellungsrunden] Laden fehlgeschlagen', err))
      .finally(() => aktiv && setLoading(false));
    return () => {
      aktiv = false;
    };
  }, [jobId, version]);

  const anlegen = async () => {
    setBusy('neu');
    try {
      const res = await fetch(`/api/jobs/${jobId}/vorstellungsrunden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datum: form.datum, uhrzeit: form.uhrzeit, dauer_minuten: form.dauer,
          adresse: form.adresse, max_teilnehmer: form.max, hinweis: form.hinweis || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Anlegen');
      toast.success('Vorstellungsrunde angelegt');
      laden();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Anlegen');
    } finally {
      setBusy(null);
    }
  };

  const loeschen = async (id: string) => {
    if (!confirm('Runde wirklich löschen?')) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/jobs/${jobId}/vorstellungsrunden/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Löschen');
      laden();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Löschen');
    } finally {
      setBusy(null);
    }
  };

  const eintragen = async (rundeId: string) => {
    const applicationId = auswahl[rundeId];
    if (!applicationId) return;
    setBusy(rundeId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/vorstellungsrunden/${rundeId}/teilnehmer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Eintragen');
      toast.success('Bewerber eingetragen – Bestätigung und Erinnerungen laufen automatisch');
      setAuswahl((a) => ({ ...a, [rundeId]: '' }));
      laden();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Eintragen');
    } finally {
      setBusy(null);
    }
  };

  // Bestehende Status-Logik der Termine: done = erschienen, no_show = nicht erschienen
  const markieren = async (appointmentId: string, status: 'done' | 'no_show') => {
    setBusy(appointmentId);
    try {
      const res = await fetch(`/api/appointments-recruiting/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Speichern');
      laden();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Lade Vorstellungsrunden...</p>;
  if (migrationFehlt) {
    return <p className="text-sm text-amber-700">Datenbank-Änderung fehlt noch – Vorstellungsrunden sind bald verfügbar.</p>;
  }

  return (
    <div className="space-y-4">
      <Card padding="none" className="p-4 space-y-3">
        <h3 className="font-medium text-gray-900">Neue Vorstellungsrunde</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
            <Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Uhrzeit</label>
            <Input type="time" value={form.uhrzeit} onChange={(e) => setForm({ ...form, uhrzeit: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dauer (Minuten)</label>
            <Input type="number" min={15} max={600} value={form.dauer} onChange={(e) => setForm({ ...form, dauer: Number(e.target.value) })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max. Teilnehmer</label>
            <Input type="number" min={1} max={500} value={form.max} onChange={(e) => setForm({ ...form, max: Number(e.target.value) })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <Input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} placeholder="Straße Nr., PLZ Ort" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Hinweis (optional)</label>
            <Input value={form.hinweis} onChange={(e) => setForm({ ...form, hinweis: e.target.value })} placeholder="z. B. Klingel Zoepp, 2. OG" />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Bewerber bekommen Datum, Uhrzeit und die vollständige Adresse per WhatsApp – bei der Buchung sowie 24 und 2 Stunden vorher.
        </p>
        <Button onClick={anlegen} disabled={busy === 'neu' || !form.adresse.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          {busy === 'neu' ? 'Legt an...' : 'Runde anlegen'}
        </Button>
      </Card>

      {runden.length === 0 && <p className="text-sm text-gray-400">Noch keine Vorstellungsrunden angelegt.</p>}

      {runden.map((r) => {
        const start = new Date(r.starts_at);
        const vorbei = start.getTime() < jetzt;
        const belegt = r.max_teilnehmer - r.freie_plaetze;
        return (
          <Card key={r.id} padding="none" className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-gray-900">
                  {start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })} um{' '}
                  {start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                </p>
                <p className="text-sm text-gray-600">{r.adresse}{r.hinweis ? ` (${r.hinweis})` : ''}</p>
                <p className="text-xs text-gray-500">
                  {belegt} von {r.max_teilnehmer} Plätzen belegt{r.freie_plaetze === 0 ? ' – voll, wird nicht mehr angeboten' : ''}
                </p>
              </div>
              {r.teilnehmer.every((t) => !['booked', 'confirmed'].includes(t.status)) && (
                <Button variant="ghost" size="sm" onClick={() => loeschen(r.id)} disabled={busy === r.id} aria-label="Runde löschen">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {r.teilnehmer.length === 0 ? (
              <p className="text-sm text-gray-400">Noch niemand gebucht.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {r.teilnehmer.map((t) => {
                  const s = STATUS[t.status] ?? { label: t.status, tone: 'neutral' as const };
                  return (
                    <li key={t.appointment_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        {t.candidate_id ? (
                          <a href={`/candidates/${t.candidate_id}`} className="text-sm font-medium text-gray-900 hover:underline">{t.name}</a>
                        ) : (
                          <span className="text-sm font-medium text-gray-900">{t.name}</span>
                        )}
                        {t.telefon && <span className="ml-2 text-xs text-gray-500">{t.telefon}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {['booked', 'confirmed'].includes(t.status) && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => markieren(t.appointment_id, 'done')} disabled={busy === t.appointment_id}>
                              <Check className="h-4 w-4 mr-1" />Erschienen
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => markieren(t.appointment_id, 'no_show')} disabled={busy === t.appointment_id}>
                              <X className="h-4 w-4 mr-1" />No-Show
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!vorbei && r.freie_plaetze > 0 && bewerbungen.length > 0 && (
              <div className="flex items-center gap-2 border-t pt-3">
                <Select
                  className="flex-1"
                  value={auswahl[r.id] ?? ''}
                  onChange={(e) => setAuswahl((a) => ({ ...a, [r.id]: e.target.value }))}
                  options={[{ value: '', label: 'Bewerber eintragen…' }, ...bewerbungen.map((b) => ({ value: b.id, label: b.name }))]}
                />
                <Button size="sm" onClick={() => eintragen(r.id)} disabled={!auswahl[r.id] || busy === r.id}>
                  <UserPlus className="h-4 w-4 mr-1" />Eintragen
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
