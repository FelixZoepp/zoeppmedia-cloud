'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Download, Trash2, ArrowRightLeft, UserPlus, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ApplicationRow } from '@/components/kanban/board';
import type { PipelineStage } from '@/lib/types/database';

type ColumnKey = 'name' | 'job' | 'stage' | 'source' | 'score' | 'phone' | 'email' | 'applied_at';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'job', label: 'Job' },
  { key: 'stage', label: 'Stufe' },
  { key: 'source', label: 'Quelle' },
  { key: 'score', label: 'Score' },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'E-Mail' },
  { key: 'applied_at', label: 'Eingang' },
];

const DEFAULT_COLUMNS: ColumnKey[] = ['name', 'job', 'stage', 'source', 'score', 'phone', 'applied_at'];

const sourceLabels: Record<string, string> = {
  meta: 'Meta', indeed: 'Indeed', manual: 'Manuell', form: 'Formular', csv: 'CSV',
};

function getStoredColumns(): ColumnKey[] {
  if (typeof window === 'undefined') return DEFAULT_COLUMNS;
  try {
    const stored = localStorage.getItem('zmc_table_columns');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_COLUMNS;
}

export function ApplicationTableView({
  applications,
  stages,
  jobs,
  users,
  onRefresh,
}: {
  applications: ApplicationRow[];
  stages: PipelineStage[];
  jobs: { id: string; title: string }[];
  users: { id: string; name: string }[];
  onRefresh: () => void;
}) {
  const [columns, setColumns] = useState<ColumnKey[]>(getStoredColumns);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [showColumns, setShowColumns] = useState(false);
  const [bulkModal, setBulkModal] = useState<'stage' | 'assign' | 'delete' | null>(null);
  const [bulkStageId, setBulkStageId] = useState('');
  const [bulkAssignTo, setBulkAssignTo] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('zmc_table_columns', JSON.stringify(columns));
  }, [columns]);

  const filtered = useMemo(() => {
    return applications.filter((a) => {
      if (search && !a.candidate.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (jobFilter && a.job_id !== jobFilter) return false;
      if (sourceFilter && a.source !== sourceFilter) return false;
      return true;
    });
  }, [applications, search, jobFilter, sourceFilter]);

  function toggleColumn(key: ColumnKey) {
    setColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((a) => a.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function executeBulk(action: 'set_stage' | 'assign' | 'delete') {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const body: Record<string, unknown> = { ids: Array.from(selected), action };
      if (action === 'set_stage') body.stage_id = bulkStageId;
      if (action === 'assign') body.assigned_to = bulkAssignTo || null;

      const res = await fetch('/api/applications/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      toast.success(`${result.affected} Bewerbung(en) aktualisiert`);
      setSelected(new Set());
      setBulkModal(null);
      onRefresh();
    } catch {
      toast.error('Fehler bei Mehrfachaktion');
    } finally {
      setBulkLoading(false);
    }
  }

  function exportCsv() {
    const headers = columns.map((k) => ALL_COLUMNS.find((c) => c.key === k)?.label ?? k);
    const rows = filtered.map((a) => columns.map((k) => {
      switch (k) {
        case 'name': return a.candidate.name;
        case 'job': return a.job.title;
        case 'stage': return a.stage?.name ?? '';
        case 'source': return sourceLabels[a.source] ?? a.source;
        case 'score': return a.score_label ?? '';
        case 'phone': return a.candidate.phone_e164 ?? a.candidate.phone ?? '';
        case 'email': return a.candidate.email ?? '';
        case 'applied_at': return new Date(a.applied_at).toLocaleDateString('de-DE');
        default: return '';
      }
    }));
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bewerber-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderCell(app: ApplicationRow, col: ColumnKey) {
    switch (col) {
      case 'name': return <a href={`/candidates/${app.candidate_id}`} className="font-medium text-gray-900 hover:text-red-600">{app.candidate.name}</a>;
      case 'job': return <span className="text-sm text-gray-700">{app.job.title}</span>;
      case 'stage': return app.stage ? <Badge tone="neutral">{app.stage.name}</Badge> : '-';
      case 'source': return <span className="text-sm">{sourceLabels[app.source] ?? app.source}</span>;
      case 'score': return app.score_label ? <Badge tone={app.score_label === 'A' ? 'accent' : app.score_label === 'B' ? 'softAccent' : 'neutral'}>{app.score_label}</Badge> : '-';
      case 'phone': return <span className="text-sm text-gray-600">{app.candidate.phone_e164 ?? app.candidate.phone ?? '-'}</span>;
      case 'email': return <span className="text-sm text-gray-600">{app.candidate.email ?? '-'}</span>;
      case 'applied_at': return <span className="text-sm text-gray-500">{new Date(app.applied_at).toLocaleDateString('de-DE')}</span>;
      default: return '-';
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-52">
          <Input type="text" placeholder="Name suchen..." value={search}
            onChange={(e) => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
        </div>
        <Select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}
          options={[{ value: '', label: 'Alle Jobs' }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]}
          className="w-48" />
        <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
          options={[
            { value: '', label: 'Alle Quellen' }, { value: 'meta', label: 'Meta' },
            { value: 'indeed', label: 'Indeed' }, { value: 'form', label: 'Formular' },
            { value: 'manual', label: 'Manuell' }, { value: 'csv', label: 'CSV' },
          ]}
          className="w-40" />
        <button onClick={() => setShowColumns(!showColumns)}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Spalten waehlen">
          <Settings2 className="w-4 h-4 text-gray-500" />
        </button>
        <Button variant="ghost" size="sm" onClick={exportCsv}>
          <Download className="w-4 h-4" /> CSV
        </Button>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-500">{selected.size} ausgewaehlt</span>
            <Button size="sm" variant="ghost" onClick={() => setBulkModal('stage')}>
              <ArrowRightLeft className="w-4 h-4" /> Stufe
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBulkModal('assign')}>
              <UserPlus className="w-4 h-4" /> Zuweisen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBulkModal('delete')}>
              <Trash2 className="w-4 h-4" /> Loeschen
            </Button>
          </div>
        )}
      </div>

      {/* Column chooser dropdown */}
      {showColumns && (
        <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg shadow-sm inline-flex flex-wrap gap-3">
          {ALL_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={columns.includes(col.key)}
                onChange={() => toggleColumn(col.key)} className="rounded border-gray-300" />
              {col.label}
            </label>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 px-3 py-3">
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll} className="rounded border-gray-300" />
              </th>
              {columns.map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {ALL_COLUMNS.find((c) => c.key === col)?.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((app) => (
              <tr key={app.id} className={`hover:bg-gray-50 ${selected.has(app.id) ? 'bg-red-50/30' : ''}`}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.has(app.id)}
                    onChange={() => toggleOne(app.id)} className="rounded border-gray-300" />
                </td>
                {columns.map((col) => (
                  <td key={col} className="px-4 py-3">{renderCell(app, col)}</td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-sm text-gray-400">Keine Ergebnisse</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Modals */}
      <Modal open={bulkModal === 'stage'} onClose={() => setBulkModal(null)} title="Stufe aendern" width="max-w-sm">
        <div className="space-y-4">
          <Select value={bulkStageId} onChange={(e) => setBulkStageId(e.target.value)}
            options={[{ value: '', label: 'Stufe waehlen' }, ...stages.map((s) => ({ value: s.id, label: s.name }))]} />
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setBulkModal(null)}>Abbrechen</Button>
            <Button className="flex-1" disabled={!bulkStageId || bulkLoading}
              onClick={() => executeBulk('set_stage')}>{bulkLoading ? 'Wird gesetzt...' : 'Uebernehmen'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulkModal === 'assign'} onClose={() => setBulkModal(null)} title="Zuweisen" width="max-w-sm">
        <div className="space-y-4">
          <Select value={bulkAssignTo} onChange={(e) => setBulkAssignTo(e.target.value)}
            options={[{ value: '', label: 'Nicht zugewiesen' }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setBulkModal(null)}>Abbrechen</Button>
            <Button className="flex-1" disabled={bulkLoading}
              onClick={() => executeBulk('assign')}>{bulkLoading ? 'Wird zugewiesen...' : 'Uebernehmen'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulkModal === 'delete'} onClose={() => setBulkModal(null)} title="Bewerbungen loeschen" width="max-w-sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {selected.size} Bewerbung(en) unwiderruflich loeschen? Die Kandidaten bleiben erhalten.
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setBulkModal(null)}>Abbrechen</Button>
            <Button variant="primary" className="flex-1" disabled={bulkLoading}
              onClick={() => executeBulk('delete')}>{bulkLoading ? 'Wird geloescht...' : 'Endgueltig loeschen'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
