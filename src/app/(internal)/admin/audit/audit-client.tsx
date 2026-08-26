'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Shield } from 'lucide-react';

interface AuditChange {
  field: string;
  old?: unknown;
  new?: unknown;
  old_label?: string;
  new_label?: string;
}

interface AuditEntry {
  id: string;
  user_id: string | null;
  agency_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: AuditChange[] | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  users: { name: string; email: string } | null;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  candidate: 'Bewerber',
  agency: 'Agentur',
  user: 'Benutzer',
  automation: 'Automatisierung',
  template: 'Template',
  pipeline_stage: 'Pipeline-Stufe',
  consent: 'Einwilligung',
  recording: 'Aufnahme',
  settings: 'Einstellungen',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Erstellt',
  update: 'Aktualisiert',
  delete: 'Geloescht',
  access: 'Zugriff',
  impersonate: 'Identitaetswechsel',
};

const ACTION_TONES: Record<string, 'success' | 'neutral' | 'accent' | 'softAccent' | 'outline'> = {
  create: 'success',
  update: 'neutral',
  delete: 'accent',
  access: 'outline',
  impersonate: 'softAccent',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ', ' + d.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '(leer)';
  if (typeof val === 'boolean') return val ? 'Ja' : 'Nein';
  return String(val);
}

function ChangeDiff({ changes }: { changes: AuditChange[] }) {
  return (
    <div className="space-y-1">
      {changes.map((c, i) => (
        <div key={i} className="text-xs leading-relaxed">
          <span className="font-medium text-gray-700">{c.field}:</span>{' '}
          <span className="text-red-600 line-through">
            {c.old_label || formatValue(c.old)}
          </span>
          {' \u2192 '}
          <span className="text-green-700 font-medium">
            {c.new_label || formatValue(c.new)}
          </span>
        </div>
      ))}
    </div>
  );
}

const PAGE_SIZE = 50;

export function AuditClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');

  const fetchEntries = useCallback(async (currentOffset: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (entityType) params.set('entity_type', entityType);
    if (action) params.set('action', action);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(currentOffset));

    const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setEntries(json.data);
      setTotal(json.total);
    }
    setLoading(false);
  }, [entityType, action]);

  useEffect(() => {
    setOffset(0);
    fetchEntries(0);
  }, [fetchEntries]);

  function handlePrev() {
    const newOffset = Math.max(0, offset - PAGE_SIZE);
    setOffset(newOffset);
    fetchEntries(newOffset);
  }

  function handleNext() {
    const newOffset = offset + PAGE_SIZE;
    if (newOffset < total) {
      setOffset(newOffset);
      fetchEntries(newOffset);
    }
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="VERWALTUNG"
        title="Audit Log"
        description="Vollstaendiges Protokoll aller Aenderungen an Entitaeten mit alten und neuen Werten."
        counter={`${total} Eintraege`}
      />

      {/* Filter bar */}
      <Card padding="sm" className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filter:</span>
          </div>
          <Select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            options={[
              { value: '', label: 'Alle Entitaeten' },
              { value: 'candidate', label: 'Bewerber' },
              { value: 'agency', label: 'Agentur' },
              { value: 'user', label: 'Benutzer' },
              { value: 'automation', label: 'Automatisierung' },
              { value: 'template', label: 'Template' },
              { value: 'pipeline_stage', label: 'Pipeline-Stufe' },
              { value: 'consent', label: 'Einwilligung' },
              { value: 'recording', label: 'Aufnahme' },
              { value: 'settings', label: 'Einstellungen' },
            ]}
            className="w-48"
          />
          <Select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            options={[
              { value: '', label: 'Alle Aktionen' },
              { value: 'create', label: 'Erstellt' },
              { value: 'update', label: 'Aktualisiert' },
              { value: 'delete', label: 'Geloescht' },
              { value: 'access', label: 'Zugriff' },
              { value: 'impersonate', label: 'Identitaetswechsel' },
            ]}
            className="w-48"
          />
        </div>
      </Card>

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">Keine Audit-Eintraege gefunden.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Zeitpunkt</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Benutzer</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aktion</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entitaet</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aenderungen</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap text-gray-500 text-xs">
                      {formatDate(entry.created_at)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {entry.users?.name || '(System)'}
                      </div>
                      {entry.users?.email && (
                        <div className="text-xs text-gray-400">{entry.users.email}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Badge tone={ACTION_TONES[entry.action] || 'neutral'}>
                        {ACTION_LABELS[entry.action] || entry.action}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {ENTITY_TYPE_LABELS[entry.entity_type] || entry.entity_type}
                      </span>
                      <div className="text-xs text-gray-400 font-mono">
                        {entry.entity_id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-5 py-3 max-w-xs">
                      {entry.changes && entry.changes.length > 0 ? (
                        <ChangeDiff changes={entry.changes} />
                      ) : (
                        <span className="text-xs text-gray-400">--</span>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                      {entry.ip_address || '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-500">
              Seite {currentPage} von {totalPages} ({total} Eintraege)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handlePrev}
                disabled={offset === 0}
              >
                Zurueck
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleNext}
                disabled={offset + PAGE_SIZE >= total}
              >
                Weiter
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
