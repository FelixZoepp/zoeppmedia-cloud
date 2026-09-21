'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { Copy, Check, Plus, Rss, Webhook, Globe } from 'lucide-react';
import { toast } from 'sonner';

interface LeadSource {
  id: string;
  kind: 'meta' | 'generic';
  name: string;
  config: Record<string, unknown> | null;
  active: boolean;
  created_at: string;
}

interface Job {
  id: string;
  title: string;
}

const KIND_OPTIONS = [
  { value: 'generic', label: 'Generischer Webhook' },
  { value: 'meta', label: 'Meta Lead Ads' },
];

const FIELD_KEYS = [
  { key: 'first_name', label: 'Vorname (Dot-Pfad)', required: false },
  { key: 'last_name', label: 'Nachname (Dot-Pfad)', required: false },
  { key: 'phone', label: 'Telefon (Dot-Pfad) *', required: true },
  { key: 'email', label: 'E-Mail (Dot-Pfad)', required: false },
  { key: 'consent', label: 'Einwilligung (Dot-Pfad)', required: false },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Kopiert');
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button variant="secondary" size="sm" onClick={handleCopy}>
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Kopiert' : 'Kopieren'}
    </Button>
  );
}

function GenericSourceConfig({
  source,
  jobs,
  webhookUrl,
  onSave,
}: {
  source: LeadSource;
  jobs: Job[];
  webhookUrl: string;
  onSave: (id: string, config: Record<string, unknown>) => Promise<void>;
}) {
  const cfg = (source.config ?? {}) as Record<string, unknown>;
  const fields = (cfg.fields as Record<string, string>) ?? {};

  const [fieldMap, setFieldMap] = useState<Record<string, string>>({
    first_name: fields.first_name ?? '',
    last_name: fields.last_name ?? '',
    phone: fields.phone ?? '',
    email: fields.email ?? '',
    consent: fields.consent ?? '',
  });
  const [jobId, setJobId] = useState<string>((cfg.job_id as string) ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!fieldMap.phone.trim()) {
      toast.error('Telefon-Pfad ist Pflicht');
      return;
    }
    setSaving(true);
    const newConfig: Record<string, unknown> = { fields: fieldMap };
    if (jobId) newConfig.job_id = jobId;
    await onSave(source.id, newConfig);
    setSaving(false);
  }

  return (
    <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Webhook-URL</p>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <code className="text-xs font-mono text-gray-900 flex-1 break-all">{webhookUrl}</code>
          <CopyButton text={webhookUrl} />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Header: <code className="font-mono">x-webhook-secret: &lt;Secret&gt;</code> (einmalig bei Anlage angezeigt)
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Feldzuordnung</p>
        <div className="space-y-2">
          {FIELD_KEYS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-44 shrink-0">{label}</span>
              <Input
                value={fieldMap[key] ?? ''}
                onChange={(e) => setFieldMap((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={`z. B. data.${key}`}
                className="flex-1"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Standard-Job</p>
        {jobs.length > 0 ? (
          <Select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            options={[{ value: '', label: 'Keiner' }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]}
          />
        ) : (
          <Input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Job-UUID"
          />
        )}
      </div>

      <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
        {saving ? 'Speichert…' : 'Konfiguration speichern'}
      </Button>
    </div>
  );
}

function MetaSourceConfig({
  source,
  jobs,
  onSave,
}: {
  source: LeadSource;
  jobs: Job[];
  onSave: (id: string, config: Record<string, unknown>) => Promise<void>;
}) {
  const cfg = (source.config ?? {}) as Record<string, unknown>;
  const formsRaw = (cfg.forms as Record<string, string>) ?? {};

  const [pageToken, setPageToken] = useState<string>((cfg.page_token as string) ?? '');
  const [defaultJobId, setDefaultJobId] = useState<string>((cfg.default_job_id as string) ?? '');
  const [formEntries, setFormEntries] = useState<{ formId: string; jobId: string }[]>(
    Object.entries(formsRaw).map(([formId, jobId]) => ({ formId, jobId })),
  );
  const [saving, setSaving] = useState(false);

  function addFormEntry() {
    setFormEntries((p) => [...p, { formId: '', jobId: '' }]);
  }

  function updateFormEntry(idx: number, field: 'formId' | 'jobId', value: string) {
    setFormEntries((p) => p.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  }

  function removeFormEntry(idx: number) {
    setFormEntries((p) => p.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    const forms: Record<string, string> = {};
    for (const { formId, jobId } of formEntries) {
      if (formId.trim()) forms[formId.trim()] = jobId.trim();
    }
    const newConfig: Record<string, unknown> = { forms };
    if (pageToken.trim()) newConfig.page_token = pageToken.trim();
    if (defaultJobId.trim()) newConfig.default_job_id = defaultJobId.trim();
    await onSave(source.id, newConfig);
    setSaving(false);
  }

  return (
    <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Seiten-Token</p>
        <Input
          value={pageToken}
          onChange={(e) => setPageToken(e.target.value)}
          placeholder="Meta Page Access Token"
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Standard-Job</p>
        {jobs.length > 0 ? (
          <Select
            value={defaultJobId}
            onChange={(e) => setDefaultJobId(e.target.value)}
            options={[{ value: '', label: 'Keiner' }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]}
          />
        ) : (
          <Input
            value={defaultJobId}
            onChange={(e) => setDefaultJobId(e.target.value)}
            placeholder="Job-UUID"
          />
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Formular → Job-Zuordnung</p>
          <Button variant="secondary" size="sm" onClick={addFormEntry}>
            <Plus className="w-3.5 h-3.5" />
            Zeile hinzufügen
          </Button>
        </div>
        <div className="space-y-2">
          {formEntries.map(({ formId, jobId }, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={formId}
                onChange={(e) => updateFormEntry(idx, 'formId', e.target.value)}
                placeholder="Meta Formular-ID"
                className="flex-1"
              />
              <span className="text-gray-400">→</span>
              {jobs.length > 0 ? (
                <Select
                  value={jobId}
                  onChange={(e) => updateFormEntry(idx, 'jobId', e.target.value)}
                  options={[{ value: '', label: 'Keinen' }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]}
                  className="flex-1"
                />
              ) : (
                <Input
                  value={jobId}
                  onChange={(e) => updateFormEntry(idx, 'jobId', e.target.value)}
                  placeholder="Job-UUID"
                  className="flex-1"
                />
              )}
              <button
                type="button"
                onClick={() => removeFormEntry(idx)}
                className="text-gray-400 hover:text-red-500 text-xs px-2"
              >
                ✕
              </button>
            </div>
          ))}
          {formEntries.length === 0 && (
            <p className="text-sm text-gray-400">Noch keine Zuordnungen</p>
          )}
        </div>
      </div>

      <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
        {saving ? 'Speichert…' : 'Konfiguration speichern'}
      </Button>
    </div>
  );
}

export function LeadSourcesManager() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Neue Quelle anlegen
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'generic' | 'meta'>('generic');
  const [creating, setCreating] = useState(false);

  // Einmalig angezeigtes Secret nach Anlage
  const [newSecret, setNewSecret] = useState<{ sourceId: string; secret: string; webhookUrl: string } | null>(null);

  const [feedCopied, setFeedCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/lead-sources');
    if (res.ok) {
      const data = await res.json();
      setSources(data.sources ?? []);
      setFeedUrl(data.feed?.url ?? null);
    }
    const jobsRes = await fetch('/api/jobs');
    if (jobsRes.ok) {
      const jobsData = await jobsRes.json();
      setJobs(Array.isArray(jobsData) ? jobsData.map((j: Job) => ({ id: j.id, title: j.title })) : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Name ist Pflicht');
      return;
    }
    setCreating(true);
    const res = await fetch('/api/lead-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: newKind, name: newName.trim() }),
    });
    setCreating(false);
    if (!res.ok) {
      toast.error('Fehler beim Anlegen der Quelle');
      return;
    }
    const data = await res.json();
    toast.success('Quelle angelegt');
    setNewName('');
    if (data.secret) {
      setNewSecret({
        sourceId: data.source.id,
        secret: data.secret,
        webhookUrl: data.webhook_url ?? '',
      });
    }
    await load();
  }

  async function handleToggleActive(source: LeadSource) {
    const res = await fetch(`/api/lead-sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !source.active }),
    });
    if (!res.ok) {
      toast.error('Fehler beim Aktualisieren');
      return;
    }
    toast.success(source.active ? 'Quelle deaktiviert' : 'Quelle aktiviert');
    await load();
  }

  async function handleSaveConfig(id: string, config: Record<string, unknown>) {
    const res = await fetch(`/api/lead-sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    if (!res.ok) {
      toast.error('Fehler beim Speichern der Konfiguration');
      return;
    }
    toast.success('Konfiguration gespeichert');
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="max-w-3xl">
      <PageHeader label="EINSTELLUNGEN" title="Lead-Quellen" description="Verwalte Eingangskanäle für Bewerbungen" />

      {/* Indeed-Feed */}
      {feedUrl && (
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Rss className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Indeed-Feed</h2>
              <p className="text-sm text-gray-400">XML-Feed für Indeed-Stellenanzeigen</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <code className="text-xs font-mono text-gray-900 flex-1 break-all">{feedUrl}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(feedUrl);
                setFeedCopied(true);
                toast.success('Feed-URL kopiert');
                setTimeout(() => setFeedCopied(false), 2000);
              }}
            >
              {feedCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {feedCopied ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
        </Card>
      )}

      {/* Einmalig Secret anzeigen */}
      {newSecret && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-semibold text-amber-900 mb-2">
            Webhook-Secret — nur einmalig sichtbar, jetzt kopieren!
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono bg-white border border-amber-200 rounded px-3 py-1.5 flex-1 break-all">
                {newSecret.secret}
              </code>
              <CopyButton text={newSecret.secret} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-700 w-24 shrink-0">Webhook-URL:</span>
              <code className="text-xs font-mono text-gray-900 flex-1 break-all">{newSecret.webhookUrl}</code>
              <CopyButton text={newSecret.webhookUrl} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNewSecret(null)}
            className="text-xs text-amber-600 hover:text-amber-800 mt-3"
          >
            Ich habe das Secret gespeichert — schließen
          </button>
        </div>
      )}

      {/* Quelle anlegen */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Plus className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Neue Quelle anlegen</h2>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="z. B. Stellenanzeige Facebook"
            />
          </div>
          <div className="w-56">
            <label className="block text-sm font-medium text-gray-700 mb-1">Art</label>
            <Select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as 'generic' | 'meta')}
              options={KIND_OPTIONS}
            />
          </div>
          <Button variant="secondary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Anlegen…' : 'Anlegen'}
          </Button>
        </div>
      </Card>

      {/* Quellen-Liste */}
      {sources.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-gray-500 text-center py-4">Noch keine Quellen angelegt.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {sources.map((source) => {
            const webhookUrl = source.kind === 'generic'
              ? `${baseUrl}/api/webhooks/generic/${source.id}`
              : null;

            return (
              <Card key={source.id} padding="md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      source.kind === 'meta' ? 'bg-blue-50' : 'bg-green-50'
                    }`}>
                      {source.kind === 'meta'
                        ? <Globe className="w-4 h-4 text-blue-600" />
                        : <Webhook className="w-4 h-4 text-green-600" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{source.name}</p>
                      <p className="text-xs text-gray-400">
                        {source.kind === 'meta' ? 'Meta Lead Ads' : 'Generischer Webhook'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      source.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {source.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleToggleActive(source)}
                    >
                      {source.active ? 'Deaktivieren' : 'Aktivieren'}
                    </Button>
                  </div>
                </div>

                {source.kind === 'generic' && webhookUrl && (
                  <GenericSourceConfig
                    source={source}
                    jobs={jobs}
                    webhookUrl={webhookUrl}
                    onSave={handleSaveConfig}
                  />
                )}

                {source.kind === 'meta' && (
                  <MetaSourceConfig
                    source={source}
                    jobs={jobs}
                    onSave={handleSaveConfig}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
