'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  proposed:  'Eingeladen',
  booked:    'Gebucht',
  confirmed: 'Bestätigt',
  done:      'Stattgefunden',
  no_show:   'Nicht erschienen',
  cancelled: 'Abgesagt',
};

const STATUS_TONES: Record<string, string> = {
  proposed:  'neutral',
  booked:    'accent',
  confirmed: 'success',
  done:      'success',
  no_show:   'softAccent',
  cancelled: 'outline',
};

interface AppointmentData {
  id: string;
  starts_at: string | null;
  ends_at:   string | null;
  type:      string;
  location:  string | null;
  status:    string;
}

export function AppointmentList({ applicationId }: { applicationId: string }) {
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch(`/api/applications/${applicationId}/appointments`)
      .then(r => r.json())
      .then(data => {
        setAppointments(data.appointments ?? []);
        setLoading(false);
      })
      .catch(() => {
        console.error('[AppointmentList] Fehler beim Laden der Termine');
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, [applicationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/appointments-recruiting/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success('Status aktualisiert');
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || 'Fehler beim Aktualisieren');
      }
    } catch {
      console.error('[AppointmentList] Fehler beim Statuswechsel', { id, status });
      toast.error('Netzwerkfehler');
    }
  };

  if (loading) return <p className="text-xs text-gray-400">Lade Termine...</p>;
  if (appointments.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-700">Termine</h4>
      {appointments.map(appt => (
        <Card key={appt.id} className="p-3">
          <div className="flex items-center justify-between">
            <div>
              {appt.starts_at && (
                <p className="text-sm font-medium">
                  {new Date(appt.starts_at).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: 'short',
                  })}{' '}
                  {new Date(appt.starts_at).toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
              <p className="text-xs text-gray-500">
                {appt.type === 'video'
                  ? 'Video'
                  : appt.type === 'onsite'
                  ? 'Vor Ort'
                  : 'Telefon'}
              </p>
            </div>
            <Badge
              tone={
                STATUS_TONES[appt.status] as
                  | 'accent'
                  | 'success'
                  | 'neutral'
                  | 'outline'
                  | 'softAccent'
              }
            >
              {STATUS_LABELS[appt.status] ?? appt.status}
            </Badge>
          </div>
          {(appt.status === 'booked' || appt.status === 'confirmed') && (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markStatus(appt.id, 'done')}
                className="text-xs"
              >
                Stattgefunden
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markStatus(appt.id, 'no_show')}
                className="text-xs"
              >
                No-Show
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
