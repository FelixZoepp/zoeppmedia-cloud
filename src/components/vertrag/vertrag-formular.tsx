'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  token: string;
  agbUrl: string | null;
  bestaetigt: { name: string | null; am: string | null } | null;
}

export function VertragFormular({ token, agbUrl, bestaetigt }: Props) {
  const [name, setName] = useState('');
  const [akzeptiert, setAkzeptiert] = useState(false);
  const [senden, setSenden] = useState(false);
  const [fehler, setFehler] = useState('');
  const [weiter, setWeiter] = useState<string | null>(null);

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setSenden(true);
    setFehler('');
    try {
      const res = await fetch(`/api/vertrag/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, akzeptiert }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setFehler(data.error || 'Bestätigung fehlgeschlagen.');
      else setWeiter(data.weiter_url ?? '/login');
    } catch {
      setFehler('Netzwerkfehler – bitte erneut versuchen.');
    }
    setSenden(false);
  }

  if (weiter || bestaetigt) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
        <p className="font-semibold text-gray-900">Vertrag bestätigt – danke!</p>
        <p className="text-sm text-gray-600">
          {bestaetigt?.am
            ? `Bestätigt von ${bestaetigt.name ?? ''} am ${new Date(bestaetigt.am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}. `
            : 'Die Bestätigung kommt gleich als PDF per Mail. '}
          Die Rechnung für den Start schicken wir dir in Kürze.
        </p>
        {weiter && (
          <a href={weiter}>
            <Button size="lg" className="w-full">Zugang zur Cloud anlegen</Button>
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      <p className="text-sm text-gray-600">
        {agbUrl ? (
          <>
            Es gelten unsere{' '}
            <a href={agbUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-red-700 underline underline-offset-2">
              Vertragsbedingungen (AGB)
            </a>
            .
          </>
        ) : (
          'Es gelten die Allgemeinen Geschäftsbedingungen von Zoepp Media – wir schicken sie dir gern zu.'
        )}
      </p>

      <label className="flex items-start gap-2.5 text-sm text-gray-800">
        <input
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 accent-red-700"
          checked={akzeptiert}
          onChange={(e) => setAkzeptiert(e.target.checked)}
        />
        <span>Ich bestätige die oben genannten Eckdaten und akzeptiere die Vertragsbedingungen verbindlich im Namen des Auftraggebers.</span>
      </label>

      <div>
        <label htmlFor="vertrag-name" className="mb-1 block text-sm font-semibold text-gray-900">
          Dein vollständiger Name
        </label>
        <Input id="vertrag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" required minLength={3} />
      </div>

      {fehler && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fehler}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={senden || !akzeptiert || name.trim().length < 3}>
        {senden ? 'Wird bestätigt …' : 'Vertrag verbindlich bestätigen'}
      </Button>
    </form>
  );
}
