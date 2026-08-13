'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IconButton } from '@/components/ui/icon-button';
import type { PipelineStage } from '@/lib/types/database';

export type Filters = {
  search: string;
  source: string;
  stage: string;
  dateFrom: string;
  dateTo: string;
};

export function FilterBar({
  stages,
  filters,
  onChange,
}: {
  stages: PipelineStage[];
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const hasFilters = filters.search || filters.source || filters.stage || filters.dateFrom || filters.dateTo;

  return (
    <div className="flex flex-wrap items-center gap-5 mb-8">
      <div className="w-52">
        <Input
          type="text"
          placeholder="Name suchen..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          icon={<Search className="w-4 h-4" />}
        />
      </div>
      <Select
        value={filters.source}
        onChange={(e) => onChange({ ...filters, source: e.target.value })}
        options={[
          { value: '', label: 'Alle Quellen' },
          { value: 'meta', label: 'Meta' },
          { value: 'indeed', label: 'Indeed' },
          { value: 'manual', label: 'Manuell' },
        ]}
        className="w-40"
      />
      <Select
        value={filters.stage}
        onChange={(e) => onChange({ ...filters, stage: e.target.value })}
        options={[
          { value: '', label: 'Alle Phasen' },
          ...stages.map((s) => ({ value: s.id, label: s.name })),
        ]}
        className="w-44"
      />
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          className="h-11 px-3 border border-gray-200 rounded-xl text-[15px] text-gray-900 bg-white shadow-sm outline-none"
        />
        <span className="text-gray-400 text-[13px]">bis</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className="h-11 px-3 border border-gray-200 rounded-xl text-[15px] text-gray-900 bg-white shadow-sm outline-none"
        />
      </div>
      {hasFilters && (
        <IconButton
          size="md"
          onClick={() => onChange({ search: '', source: '', stage: '', dateFrom: '', dateTo: '' })}
          title="Filter zurücksetzen"
        >
          <X className="w-4 h-4" />
        </IconButton>
      )}
    </div>
  );
}

export function applyFilters<T extends { name: string; source: string; current_stage_id: string; created_at: string }>(
  candidates: T[],
  filters: Filters
): T[] {
  return candidates.filter((c) => {
    if (filters.search && !c.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.source && c.source !== filters.source) return false;
    if (filters.stage && c.current_stage_id !== filters.stage) return false;
    if (filters.dateFrom && c.created_at < filters.dateFrom) return false;
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setDate(endDate.getDate() + 1);
      if (c.created_at >= endDate.toISOString()) return false;
    }
    return true;
  });
}
