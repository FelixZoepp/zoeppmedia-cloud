'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';

const WEEKDAYS = [
  { value: '1', label: 'Montag' },
  { value: '2', label: 'Dienstag' },
  { value: '3', label: 'Mittwoch' },
  { value: '4', label: 'Donnerstag' },
  { value: '5', label: 'Freitag' },
  { value: '6', label: 'Samstag' },
  { value: '0', label: 'Sonntag' },
];

const APPOINTMENT_TYPES = [
  { value: 'call', label: 'Telefon' },
  { value: 'video', label: 'Video' },
  { value: 'onsite', label: 'Vor Ort' },
];

interface Rule {
  weekday: number;
  start_time: string;
  end_time: string;
}

export function AvailabilityEditor({ jobId }: { jobId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [appointmentType, setAppointmentType] = useState('call');
  const [location, setLocation] = useState('');
  const [duration, setDuration] = useState(30);
  const [buffer, setBuffer] = useState(15);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/availability`)
      .then((r) => r.json())
      .then((data) => {
        setRules(
          data.rules?.map((r: Record<string, unknown>) => ({
            weekday: r.weekday,
            start_time: r.start_time,
            end_time: r.end_time,
          })) ?? [],
        );
        setAppointmentType(String(data.job?.appointment_type ?? 'call'));
        setLocation(String(data.job?.appointment_location ?? ''));
        setDuration(Number(data.job?.appointment_duration_minutes ?? 30));
        setBuffer(Number(data.job?.appointment_buffer_minutes ?? 15));
        setLoading(false);
      })
      .catch((err) => {
        console.error('[AvailabilityEditor] Laden fehlgeschlagen', err);
        setLoading(false);
      });
  }, [jobId]);

  const addRule = () => {
    setRules([...rules, { weekday: 1, start_time: '09:00:00', end_time: '17:00:00' }]);
  };

  const removeRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules,
          appointment_type: appointmentType,
          appointment_location: location || null,
          appointment_duration_minutes: duration,
          appointment_buffer_minutes: buffer,
        }),
      });
      if (res.ok) {
        toast.success('Verfügbarkeiten gespeichert');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Fehler beim Speichern');
      }
    } catch (err) {
      console.error('[AvailabilityEditor] Speichern fehlgeschlagen', err);
      toast.error('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Lade...</p>;

  return (
    <Card padding="none" className="p-4 space-y-4">
      <h3 className="font-medium text-gray-900">Termineinstellungen</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Terminart</label>
          <Select
            value={appointmentType}
            onChange={(e) => setAppointmentType(e.target.value)}
            options={APPOINTMENT_TYPES}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ort / Link</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Adresse oder Video-Link"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dauer (Minuten)</label>
          <Input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={10}
            max={240}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Puffer (Minuten)</label>
          <Input
            type="number"
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            min={0}
            max={60}
          />
        </div>
      </div>

      <h3 className="font-medium text-gray-900 pt-2">Verfügbare Zeitfenster</h3>

      {rules.length === 0 && (
        <p className="text-sm text-gray-400">Noch keine Zeitfenster definiert.</p>
      )}

      {rules.map((rule, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Select
            value={String(rule.weekday)}
            onChange={(e) => {
              const updated = [...rules];
              updated[idx] = { ...rule, weekday: Number(e.target.value) };
              setRules(updated);
            }}
            options={WEEKDAYS}
          />
          <Input
            type="time"
            value={rule.start_time.slice(0, 5)}
            onChange={(e) => {
              const updated = [...rules];
              updated[idx] = { ...rule, start_time: e.target.value + ':00' };
              setRules(updated);
            }}
          />
          <span className="text-gray-400 shrink-0">bis</span>
          <Input
            type="time"
            value={rule.end_time.slice(0, 5)}
            onChange={(e) => {
              const updated = [...rules];
              updated[idx] = { ...rule, end_time: e.target.value + ':00' };
              setRules(updated);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeRule(idx)}
            className="shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button variant="ghost" size="sm" onClick={addRule}>
        <Plus className="h-4 w-4 mr-1" />
        Zeitfenster hinzufügen
      </Button>

      <div className="pt-2 border-t">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? 'Speichert...' : 'Speichern'}
        </Button>
      </div>
    </Card>
  );
}
