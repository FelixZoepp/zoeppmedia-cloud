'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Brain, Check, Copy, KeyRound, Loader2, PlugZap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Stand {
  aktiv: boolean;
  freigeschaltet_am: string | null;
  hatSchluessel: boolean;
  hatWebhookSecret: boolean;
}

function Kopierfeld({ label, wert }: { label: string; wert: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800">{wert}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(wert);
            setOk(true);
            setTimeout(() => setOk(false), 2000);
          }}
          className="shrink-0 rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
          title="Kopieren"
        >
          {ok ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
        </button>
      </div>
    </div>
  );
}

/** 12 Persona-Typen: Freischalten, API-Schlüssel, Webhook für den Kunden */
export function PersonaKarte({ agencyId, origin }: { agencyId: string; origin: string }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [schluessel, setSchluessel] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<'speichern' | 'test' | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/admin/integrations/${agencyId}/persona`);
    if (r.ok) setStand(await r.json());
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function speichern(patch: Record<string, unknown>) {
    setBusy('speichern');
    const r = await fetch(`/api/admin/integrations/${agencyId}/persona`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return toast.error(d.error ?? 'Speichern fehlgeschlagen');
    if (d.webhookSecret) setSecret(d.webhookSecret);
    setSchluessel('');
    toast.success('Gespeichert');
    await laden();
  }

  async function testen() {
    setBusy('test');
    const r = await fetch(`/api/admin/integrations/${agencyId}/persona`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (d.ok) toast.success('Verbindung zum Persona-Test steht');
    else toast.error(d.fehler ?? 'Verbindung fehlgeschlagen');
  }

  if (!stand) return null;
  const webhookUrl = `${origin}/api/webhooks/persona?agency=${agencyId}`;

  return (
    <Card padding="lg" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-red-50 text-red-800">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">12 Persona-Typen</h2>
            <p className="mt-0.5 max-w-[60ch] text-[13px] text-gray-600">
              Persönlichkeitstest für Vertriebsbewerber (12personatypen.de). Freigeschaltet kann der Kunde Bewerbern den Test mit einem Klick schicken, das
              Ergebnis landet automatisch beim Bewerber.
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium">
          <span>{stand.aktiv ? 'Freigeschaltet' : 'Gesperrt'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={stand.aktiv}
            disabled={busy !== null}
            onClick={() => speichern({ aktiv: !stand.aktiv })}
            className={`relative h-6 w-11 rounded-full transition-colors ${stand.aktiv ? 'bg-red-700' : 'bg-gray-300'}`}
          >
            <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${stand.aktiv ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        </label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <KeyRound className="h-3.5 w-3.5" /> API-Schlüssel {stand.hatSchluessel && <span className="normal-case text-green-700">· hinterlegt</span>}
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input type="password" value={schluessel} onChange={(e) => setSchluessel(e.target.value)} placeholder={stand.hatSchluessel ? 'Neuen Schlüssel eintragen' : 'at_…'} />
            </div>
            <Button onClick={() => speichern({ api_key: schluessel })} disabled={busy !== null || schluessel.trim().length < 10}>
              {busy === 'speichern' ? <Loader2 className="animate-spin" /> : 'Speichern'}
            </Button>
          </div>
          <p className="mt-1.5 text-[12px] text-gray-500">Im 12personatypen-Dashboard unter Einstellungen → API-Keys erstellen.</p>
        </div>
        <div className="space-y-3">
          <Kopierfeld label="Webhook-URL (im 12personatypen-Dashboard eintragen)" wert={webhookUrl} />
          {secret ? (
            <Kopierfeld label="Webhook-Secret – nur jetzt sichtbar" wert={secret} />
          ) : (
            <p className="text-[12px] text-gray-500">
              {stand.hatWebhookSecret ? 'Webhook-Secret ist hinterlegt. ' : 'Das Webhook-Secret wird beim ersten Speichern erzeugt. '}
              <button type="button" className="font-medium text-red-800 hover:underline" onClick={() => speichern({ neues_secret: true })}>
                Neues Secret erzeugen
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Button variant="secondary" onClick={testen} disabled={busy !== null || !stand.hatSchluessel}>
          {busy === 'test' ? <Loader2 className="animate-spin" /> : <PlugZap />} Verbindung testen
        </Button>
      </div>
    </Card>
  );
}
