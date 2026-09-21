'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IconButton } from '@/components/ui/icon-button';

// Minimal shape for applyApplicationFilters — kept in sync with ApplicationRow in board.tsx
type AppForFilter = {
  source: string;
  stage_id: string | null;
  job_id: string;
  applied_at: string;
  candidate: { name: string };
};

// ─── Application-based filter types and components ───────────────────────────

export type ApplicationFilters = {
  search: string;
  source: string;
  stage: string;
  job: string;
  dateFrom: string;
  dateTo: string;
};

export function ApplicationFilterBar({
  stages,
  jobs,
  filters,
  onChange,
}: {
  stages: { id: string; name: string }[];
  jobs: { id: string; title: string }[];
  filters: ApplicationFilters;
  onChange: (filters: ApplicationFilters) => void;
}) {
  const hasFilters = filters.search || filters.source || filters.stage || filters.job || filters.dateFrom || filters.dateTo;

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="w-52">
        <Input type="text" placeholder="Name suchen..." value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          icon={<Search className="w-4 h-4" />} />
      </div>
      <Select value={filters.job} onChange={(e) => onChange({ ...filters, job: e.target.value })}
        options={[{ value: '', label: 'Alle Jobs' }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]}
        className="w-48" />
      <Select value={filters.source} onChange={(e) => onChange({ ...filters, source: e.target.value })}
        options={[
          { value: '', label: 'Alle Quellen' },
          { value: 'meta', label: 'Meta' },
          { value: 'indeed', label: 'Indeed' },
          { value: 'manual', label: 'Manuell' },
          { value: 'form', label: 'Formular' },
          { value: 'csv', label: 'CSV-Import' },
        ]}
        className="w-40" />
      <Select value={filters.stage} onChange={(e) => onChange({ ...filters, stage: e.target.value })}
        options={[{ value: '', label: 'Alle Stufen' }, ...stages.map((s) => ({ value: s.id, label: s.name }))]}
        className="w-44" />
      {hasFilters && (
        <IconButton size="md" onClick={() => onChange({ search: '', source: '', stage: '', job: '', dateFrom: '', dateTo: '' })}
          title="Filter zuruecksetzen">
          <X className="w-4 h-4" />
        </IconButton>
      )}
    </div>
  );
}

export function applyApplicationFilters<T extends AppForFilter>(apps: T[], filters: ApplicationFilters): T[] {
  return apps.filter((a) => {
    if (filters.search && !a.candidate.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.source && a.source !== filters.source) return false;
    if (filters.stage && a.stage_id !== filters.stage) return false;
    if (filters.job && a.job_id !== filters.job) return false;
    if (filters.dateFrom && a.applied_at < filters.dateFrom) return false;
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setDate(endDate.getDate() + 1);
      if (a.applied_at >= endDate.toISOString()) return false;
    }
    return true;
  });
}
