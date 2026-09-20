'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Copy,
  Filter,
  Megaphone,
  Mail,
  RefreshCw,
} from 'lucide-react';

interface IntegrationData {
  agency: { id: string; name: string; meta_ad_account_id: string | null };
  funnel: {
    id: string;
    perspective_funnel_id: string | null;
    status: string;
    url: string | null;
  } | null;
  email_log: {
    status: string;
    error_message: string | null;
    to_address: string;
    subject: string | null;
    created_at: string;
  }[];
  candidates_by_source: Record<string, number>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 break-all">
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="shrink-0 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          title="Kopieren"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4 text-gray-500" />
          )}
        </button>
      </div>
    </div>
  );
}

export function IntegrationenClient({ agencyId }: { agencyId: string }) {
  const [data, setData] = useState<IntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [funnelId, setFunnelId] = useState('');
  const [metaAccount, setMetaAccount] = useState('');
  const [saving, setSaving] = useState<'perspective' | 'meta' | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/integrations/${agencyId}`);
    if (res.ok) {
      const d: IntegrationData = await res.json();
      setData(d);
      setFunnelId(d.funnel?.perspective_funnel_id ?? '');
      setMetaAccount(d.agency.meta_ad_account_id ?? '');
    }
    setLoading(false);
  }, [agencyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(field: 'perspective' | 'meta') {
    setSaving(field);
    const body =
      field === 'perspective'
        ? { perspective_funnel_id: funnelId }
        : { meta_ad_account_id: metaAccount };
    const res = await fetch(`/api/admin/integrations/${agencyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(null);
    if (res.ok) {
      toast.success('Gespeichert');
      load();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? 'Speichern fehlgeschlagen');
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const sources = data.candidates_by_source;
  const perspectiveConnected = !!data.funnel?.perspective_funnel_id;
  const metaConnected = !!data.agency.meta_ad_account_id;
  const indeedReceived = data.email_log.length > 0;

  return (
    <div className="max-w-4xl">
      <Link
        href={`/clients/${agencyId}`}
        className="inline-flex items-center gap-1.5 text-gray-600 hover:text-red-500 text-sm mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück zum Kunden
      </Link>

      <PageHeader
        label="INTEGRATIONEN"
        title={`Lead-Anbindung: ${data.agency.name}`}
        description="Perspective, Meta und Indeed verbinden, damit Bewerber automatisch in der Pipeline landen"
        action={
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4" /> Aktualisieren
          </Button>
        }
      />

      {/* Eingangs-Statistik */}
      <Card padding="md" className="mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Bewerber nach Quelle
        </p>
        {Object.keys(sources).length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Noch keine Bewerber eingegangen — Anbindungen unten prüfen.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(sources).map(([source, n]) => (
              <Badge key={source} tone="neutral">
                {source}: {n}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-6">
        {/* Perspective */}
        <Card padding="lg">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <Filter className="w-5 h-5 text-violet-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-gray-900">Perspective Funnel</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Leads aus dem Recruiting-Funnel automatisch importieren
              </p>
            </div>
            <Badge tone={perspectiveConnected ? 'success' : 'neutral'}>
              {perspectiveConnected ? 'Verbunden' : 'Nicht verbunden'}
            </Badge>
          </div>

          <div className="space-y-4">
            <CopyField
              label="Webhook-URL (in Perspective im Funnel hinterlegen)"
              value={`${origin}/api/webhooks/perspective?agency=${agencyId}`}
            />
            <p className="text-xs text-gray-400">
              In Perspective: Funnel → Integrationen → Webhook → diese URL eintragen
              (Trigger: &quot;Funnel abgeschlossen&quot;). Der <code>agency</code>-Parameter
              ordnet alle Leads dieses Funnels dem Kunden zu — Name, E-Mail und Telefon
              werden automatisch aus dem Perspective-Payload gelesen.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Perspective Funnel-ID (optional, für Statistiken)
              </label>
              <div className="flex gap-2">
                <Input
                  value={funnelId}
                  onChange={(e) => setFunnelId(e.target.value)}
                  placeholder="z.B. fnl_abc123 (aus der Perspective-URL)"
                />
                <Button
                  variant="primary"
                  onClick={() => save('perspective')}
                  disabled={saving === 'perspective'}
                >
                  {saving === 'perspective' ? 'Speichert...' : 'Speichern'}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Meta */}
        <Card padding="lg">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-gray-900">Meta Lead Ads</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Leadgen-Formulare direkt in die Pipeline + Ad-Insights für KPI-Reports
              </p>
            </div>
            <Badge tone={metaConnected ? 'success' : 'neutral'}>
              {metaConnected ? 'Verbunden' : 'Nicht verbunden'}
            </Badge>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Meta Ad-Account-ID
              </label>
              <div className="flex gap-2">
                <Input
                  value={metaAccount}
                  onChange={(e) => setMetaAccount(e.target.value)}
                  placeholder="z.B. act_1234567890"
                />
                <Button
                  variant="primary"
                  onClick={() => save('meta')}
                  disabled={saving === 'meta'}
                >
                  {saving === 'meta' ? 'Speichert...' : 'Speichern'}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Wird für den täglichen Insights-Sync (CPL, Spend, Reports) verwendet.
              </p>
            </div>

            <CopyField
              label="Leadgen-Webhook-URL (in der Meta App abonnieren)"
              value={`${origin}/api/webhooks/meta?agency=${agencyId}`}
            />
            <p className="text-xs text-gray-400">
              Der <code>agency</code>-Parameter ordnet die Page dieser Agentur zu.
              Signaturprüfung läuft über das App Secret.
            </p>
          </div>
        </Card>

        {/* Indeed */}
        <Card padding="lg">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
              <Mail className="w-5 h-5 text-sky-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-gray-900">Indeed (E-Mail-Eingang)</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Bewerbungs-Mails werden geparst, Lebenslauf per KI ausgelesen
              </p>
            </div>
            <Badge tone={indeedReceived ? 'success' : 'neutral'}>
              {indeedReceived ? 'Aktiv' : 'Keine Mails empfangen'}
            </Badge>
          </div>

          <div className="space-y-4">
            <CopyField
              label="Weiterleitungs-Adresse (in Indeed als Empfänger eintragen)"
              value={`bewerber+${agencyId}@zoepp-gruppe.de`}
            />
            <CopyField
              label="Webhook-URL (für den E-Mail-Forwarder)"
              value={`${origin}/api/webhooks/indeed-email`}
            />
            <p className="text-xs text-gray-400">
              Der Forwarder (z.B. Mailgun/CloudMailin) muss eingehende Mails als JSON an
              die Webhook-URL posten. Die Agentur wird über das{' '}
              <code>+&lt;agency-id&gt;</code>-Tag in der Adresse zugeordnet.
            </p>

            {data.email_log.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Letzte Eingänge
                </p>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                  {data.email_log.map((log, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Badge
                        tone={log.status === 'processed' ? 'success' : 'accent'}
                      >
                        {log.status}
                      </Badge>
                      <span className="flex-1 truncate text-gray-700">
                        {log.subject ?? '(kein Betreff)'}
                      </span>
                      {log.error_message && (
                        <span className="text-xs text-red-600 truncate max-w-[200px]">
                          {log.error_message}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(log.created_at).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
