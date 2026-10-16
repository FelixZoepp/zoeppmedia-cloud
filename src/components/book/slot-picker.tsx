'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SlotPickerProps {
  token: string;
  appointmentType: string;
  location: string | null;
  hasBooking: boolean;
  bookedStart: string | null;
  bookedEnd: string | null;
  agencyTimezone: string;
}

interface SlotData {
  start: string;
  end: string;
}

interface RundeData {
  id: string;
  start: string;
  end: string;
  adresse: string;
  freie_plaetze: number;
}

export function SlotPicker({ token, appointmentType, location, hasBooking, bookedStart, agencyTimezone }: SlotPickerProps) {
  const [slots, setSlots] = useState<SlotData[]>([]);
  // Vorstellungsrunde: feste Gruppentermine statt Einzelslots
  const [runden, setRunden] = useState<RundeData[] | null>(null);
  const [selectedRunde, setSelectedRunde] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);

  const fetchSlots = useCallback(() => {
    setLoading(true);
    fetch(`/api/book/${token}/slots`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error ?? 'Termine konnten nicht geladen werden');
          setSlots([]);
        } else {
          setSlots(data.slots ?? []);
          setRunden(data.modus === 'vorstellungsrunde' ? (data.runden ?? []) : null);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Slots konnten nicht geladen werden');
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Slots nach Tag gruppieren
  const slotsByDay = new Map<string, SlotData[]>();
  for (const slot of slots) {
    const day = new Date(slot.start).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long', timeZone: agencyTimezone,
    });
    if (!slotsByDay.has(day)) slotsByDay.set(day, []);
    slotsByDay.get(day)!.push(slot);
  }

  const handleBook = async (action: 'book' | 'reschedule') => {
    if (!selectedSlot && !selectedRunde) return;
    setBooking(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedRunde ? { action, runde_id: selectedRunde } : { action, start: selectedSlot }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Buchung fehlgeschlagen');
        if (res.status === 409) {
          setSelectedSlot(null);
          setSelectedDay(null);
          setSelectedRunde(null);
          fetchSlots();
        }
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Netzwerkfehler');
    }
    setBooking(false);
  };

  const handleCancel = async () => {
    setBooking(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Absage fehlgeschlagen');
      }
    } catch {
      setError('Netzwerkfehler');
    }
    setBooking(false);
  };

  if (success) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-2xl">&#10003;</div>
        <p className="text-lg font-medium text-gray-900">Erledigt!</p>
        <p className="text-sm text-gray-600">
          Du erhältst eine Bestätigung per WhatsApp.
        </p>
      </div>
    );
  }

  // Bestehender Termin anzeigen (außer wenn Verschieben-Modus aktiv)
  if (hasBooking && bookedStart && !showReschedule) {
    const date = new Date(bookedStart);
    return (
      <div>
        <Card padding="sm" className="mb-4">
          <p className="font-medium text-gray-900">Dein Termin</p>
          <p className="text-sm text-gray-600">
            {date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', timeZone: agencyTimezone })}{' '}
            um {date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: agencyTimezone })} Uhr
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {appointmentType === 'video'
              ? 'Videogespräch'
              : appointmentType === 'onsite'
              ? `Vor Ort: ${location || ''}`
              : 'Telefongespräch'}
          </p>
        </Card>
        <div className="flex gap-2">
          <Button onClick={() => setShowReschedule(true)} className="flex-1">
            Verschieben
          </Button>
          <Button onClick={handleCancel} disabled={booking} variant="secondary" className="flex-1">
            Absagen
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (loading) return <p className="py-8 text-center text-gray-500">Lade verfügbare Termine...</p>;

  if (runden) {
    if (runden.length === 0) {
      return <p className="py-8 text-center text-gray-500">Aktuell sind alle Vorstellungsrunden belegt. Wir melden uns bei dir.</p>;
    }
    const gewaehlt = runden.find((r) => r.id === selectedRunde);
    return (
      <div>
        <p className="mb-4 text-sm text-gray-600">
          {showReschedule ? 'Wähle eine neue Vorstellungsrunde aus:' : 'Wähle eine Vorstellungsrunde vor Ort aus:'}
        </p>
        <div className="mb-4 space-y-2">
          {runden.map((r) => {
            const d = new Date(r.start);
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRunde(r.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedRunde === r.id
                    ? 'border-blue-600 bg-blue-50 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                }`}
              >
                <span className="block font-medium">
                  {d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', timeZone: agencyTimezone })}{' '}
                  um {d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: agencyTimezone })} Uhr
                </span>
                <span className="block text-xs text-gray-500">{r.adresse}</span>
                <span className="block text-xs text-gray-500">
                  {r.freie_plaetze === 1 ? 'Noch 1 Platz frei' : `Noch ${r.freie_plaetze} Plätze frei`}
                </span>
              </button>
            );
          })}
        </div>
        {gewaehlt && (
          <div className="border-t pt-4">
            <Badge tone="neutral">Vorstellungsrunde vor Ort</Badge>
            <p className="mt-1 text-xs text-gray-500">{gewaehlt.adresse}</p>
            <Button
              onClick={() => handleBook(showReschedule ? 'reschedule' : 'book')}
              disabled={booking}
              className="mt-3 w-full"
            >
              {booking ? 'Wird gebucht...' : showReschedule ? 'Termin verschieben' : 'Platz buchen'}
            </Button>
          </div>
        )}
        {showReschedule && (
          <button
            onClick={() => { setShowReschedule(false); setSelectedRunde(null); }}
            className="mt-2 w-full text-sm text-gray-500 hover:text-gray-700"
          >
            Abbrechen
          </button>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (slots.length === 0) {
    return <p className="py-8 text-center text-gray-500">Aktuell keine freien Termine verfügbar.</p>;
  }

  const days = Array.from(slotsByDay.keys());

  return (
    <div>
      {showReschedule && (
        <p className="mb-4 text-sm text-gray-600">
          Wähle einen neuen Termin aus:
        </p>
      )}

      {/* Tagesliste */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {days.map(day => (
          <button
            key={day}
            onClick={() => { setSelectedDay(day); setSelectedSlot(null); }}
            className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
              selectedDay === day
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Zeiten-Grid */}
      {selectedDay && slotsByDay.get(selectedDay) && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {slotsByDay.get(selectedDay)!.map(slot => {
            const time = new Date(slot.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: agencyTimezone });
            return (
              <button
                key={slot.start}
                onClick={() => setSelectedSlot(slot.start)}
                className={`rounded-lg border py-2 text-sm ${
                  selectedSlot === slot.start
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                }`}
              >
                {time}
              </button>
            );
          })}
        </div>
      )}

      {/* Bestätigung */}
      {selectedSlot && (
        <div className="border-t pt-4">
          <p className="mb-3 text-sm text-gray-600">
            {new Date(selectedSlot).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', timeZone: agencyTimezone })}{' '}
            um {new Date(selectedSlot).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: agencyTimezone })} Uhr
          </p>
          <Badge tone="neutral">
            {appointmentType === 'video' ? 'Videogespräch' : appointmentType === 'onsite' ? 'Vor Ort' : 'Telefon'}
          </Badge>
          {location && <p className="mt-1 text-xs text-gray-500">{location}</p>}
          <Button
            onClick={() => handleBook(showReschedule ? 'reschedule' : 'book')}
            disabled={booking}
            className="mt-3 w-full"
          >
            {booking ? 'Wird gebucht...' : showReschedule ? 'Termin verschieben' : 'Termin buchen'}
          </Button>
          {showReschedule && (
            <button
              onClick={() => { setShowReschedule(false); setSelectedSlot(null); setSelectedDay(null); }}
              className="mt-2 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Abbrechen
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
