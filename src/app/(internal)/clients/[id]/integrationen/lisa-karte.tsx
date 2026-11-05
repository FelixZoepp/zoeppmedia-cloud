'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Check, Copy, KeyRound, Loader2, PlugZap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Stand {
  status: 'angefragt' | 'eingerichtet' | 'aktiv' | 'pausiert' | null;
  basis_url: string | null;
  hatSchluessel: boolean;
  hatWebhookSecret: boolean;
  einwilligung_text: string | null;
  einwilligung_version: string | null;
  angefragt_am: string | null;
  anfrage_notiz: string | null;
  aktiviert_am: string | null;
  letzter_versand_am: string | null;
  letztes_ereignis_am: string | null;
  letzter_fehler: string | null;
  fehlt: string[];
}

const zeit = (d: string | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');

const STATUS: Record<NonNullable<Stand['status']>, { label: string; tone: 'success' | 'softAccent' | 'neutral' | 'warning' }> = {
  angefragt: { label: 'Vom Kunden angefragt', tone: 'warning' },
  eingerichtet: { label: 'Eingerichtet – noch nicht aktiv', tone: 'softAccent' },
  aktiv: { label: 'Aktiv', tone: 'success' },
  pausiert: { label: 'Pausiert', tone: 'neutral' },
};

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

/**
 * Hiring Lisa (eigenes Produkt) für diesen Kunden anbinden: Schlüssel aus Lisa eintragen, Webhook-URL in Lisa hinterlegen, freischalten.
 * Aktiv = neue Bewerbungen gehen an Lisa (KI-Anruf in ≤ 60 s), eigener Erstkontakt der Cloud entfällt. Keine Rechnung, keine Nachricht.
 */
export function LisaKarte({ agencyId, origin }: { agencyId: string; origin: string }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [schluessel, setSchluessel] = useState('');
  const [secret, setSecret] = useState('');
  const [einwilligung, setEinwilligung] = useState('');
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/admin/integrations/${agencyId}/lisa`);
    if (!r.ok) return;
    const d = (await r.json()) as Stand;
    setStand(d);
    setEinwilligung(d.einwilligung_text ?? '');
    setVersion(d.einwilligung_version ?? '');
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function speichern(patch: Record<string, unknown>, was = 'speichern') {
    setBusy(was);
    const r = await fetch(`/api/admin/integrations/${agencyId}/lisa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return toast.error(d.error ?? 'Speichern fehlgeschlagen');
    setSchluessel('');
    setSecret('');
    toast.success('Gespeichert');
    await laden();
  }

  async function testen() {
    setBusy('test');
    const r = await fetch(`/api/admin/integrations/${agencyId}/lisa`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (d.ok) toast.success('Verbindung zu Hiring Lisa steht');
    else toast.error(d.fehler ?? 'Verbindung fehlgeschlagen');
  }

  if (!stand) return null;
  const webhookUrl = `${origin}/api/webhooks/lisa?agency=${agencyId}`;
  const s = stand.status ? STATUS[stand.status] : null;

  return (
    <Card padding="lg" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-red-50 text-red-800">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-900">
              Hiring Lisa {s ? <Badge tone={s.tone}>{s.label}</Badge> : <Badge tone="neutral">Nicht gebucht</Badge>}
            </h2>
            <p className="mt-0.5 max-w-[64ch] text-[13px] text-gray-600">
              KI ruft neue Bewerber in ≤ 60 Sekunden an. Aktiv gehen neue Bewerbungen an Lisa, der eigene Erstkontakt der Cloud (Bot, Anruf-Auftrag)
              entfällt. Anrufe, Ergebnisse, Phase und Termine kommen hierher zurück. Paket, Vertrag und Rechnung macht ihr selbst.
            </p>
            {stand.angefragt_am && (
              <p className="mt-1 text-[12px] text-gray-500">
                Angefragt am {zeit(stand.angefragt_am)}
                {stand.anfrage_notiz ? ` · „${stand.anfrage_notiz}“` : ''}
              </p>
            )}
          </div>
        </div>
        {(stand.status === 'eingerichtet' || stand.status === 'pausiert') && (
          <Button onClick={() => speichern({ status: 'aktiv' }, 'aktiv')} disabled={busy !== null || stand.fehlt.length > 0}>
            {busy === 'aktiv' ? <Loader2 className="animate-spin" /> : null} Freischalten
          </Button>
        )}
        {stand.status === 'aktiv' && (
          <Button variant="secondary" onClick={() => speichern({ status: 'pausiert' }, 'aktiv')} disabled={busy !== null}>
            Pausieren
          </Button>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <KeyRound className="h-3.5 w-3.5" /> Bewerbungs-Eingang (API-Schlüssel) {stand.hatSchluessel && <span className="normal-case text-green-700">· hinterlegt</span>}
            </p>
            <Input type="password" value={schluessel} onChange={(e) => setSchluessel(e.target.value)} placeholder={stand.hatSchluessel ? 'Neuen Schlüssel eintragen' : 'lisa_in_…'} />
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <KeyRound className="h-3.5 w-3.5" /> Rückmeldung (Webhook-Secret) {stand.hatWebhookSecret && <span className="normal-case text-green-700">· hinterlegt</span>}
            </p>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={stand.hatWebhookSecret ? 'Neues Secret eintragen' : 'lisa_whsec_…'} />
          </div>
          <Button onClick={() => speichern({ api_key: schluessel, webhook_secret: secret })} disabled={busy !== null || (!schluessel.trim() && !secret.trim())}>
            {busy === 'speichern' ? <Loader2 className="animate-spin" /> : 'Schlüssel speichern'}
          </Button>
          <p className="text-[12px] text-gray-500">In Lisa beim Kunden unter Einstellungen → Integrationen anlegen: „Bewerbungs-Eingang“ und „Rückmeldung (Webhook)“.</p>
        </div>
        <div className="space-y-3">
          <Kopierfeld label="Webhook-URL (in Lisa bei „Rückmeldung“ und „WhatsApp über bestehendes System“ eintragen)" wert={webhookUrl} />
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">Einwilligung zum KI-Anruf (Pflicht)</p>
            <textarea
              value={einwilligung}
              onChange={(e) => setEinwilligung(e.target.value)}
              rows={3}
              placeholder="Ich bin einverstanden, dass mich ein digitaler Assistent von … zu meiner Bewerbung anruft."
              className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <div className="mt-2 flex gap-2">
              <div className="w-40">
                <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version, z. B. 2026-11-v1" />
              </div>
              <Button variant="secondary" onClick={() => speichern({ einwilligung_text: einwilligung, einwilligung_version: version }, 'einwilligung')} disabled={busy !== null}>
                {busy === 'einwilligung' ? <Loader2 className="animate-spin" /> : 'Speichern'}
              </Button>
            </div>
            <p className="mt-1.5 text-[12px] text-gray-500">
              Genau dieser Text muss im Bewerbungsformular / Funnel des Kunden stehen. Ohne Einwilligung ruft Lisa nie an.
            </p>
          </div>
        </div>
      </div>

      {stand.fehlt.length > 0 && stand.status !== 'aktiv' && <p className="mt-4 text-[13px] text-amber-800">Zum Freischalten fehlt: {stand.fehlt.join(', ')}</p>}
      {stand.letzter_fehler && <p className="mt-2 text-[13px] text-red-700">Letzter Fehler: {stand.letzter_fehler}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button variant="secondary" onClick={testen} disabled={busy !== null || !stand.hatSchluessel}>
          {busy === 'test' ? <Loader2 className="animate-spin" /> : <PlugZap />} Verbindung testen
        </Button>
        <span className="text-[12px] text-gray-500">
          Zuletzt an Lisa: {zeit(stand.letzter_versand_am)} · Letzte Rückmeldung: {zeit(stand.letztes_ereignis_am)}
        </span>
      </div>
    </Card>
  );
}
