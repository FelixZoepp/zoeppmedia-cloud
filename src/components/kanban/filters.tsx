'use client';

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
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <input
        type="text"
        placeholder="Name suchen..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
      />
      <select
        value={filters.source}
        onChange={(e) => onChange({ ...filters, source: e.target.value })}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">Alle Quellen</option>
        <option value="meta">Meta</option>
        <option value="indeed">Indeed</option>
        <option value="manual">Manuell</option>
      </select>
      <select
        value={filters.stage}
        onChange={(e) => onChange({ ...filters, stage: e.target.value })}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">Alle Phasen</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <input
        type="date"
        value={filters.dateTo}
        onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {(filters.search || filters.source || filters.stage || filters.dateFrom || filters.dateTo) && (
        <button
          onClick={() => onChange({ search: '', source: '', stage: '', dateFrom: '', dateTo: '' })}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Filter zurücksetzen
        </button>
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
