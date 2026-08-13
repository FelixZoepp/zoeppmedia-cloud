'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Save, RotateCcw } from 'lucide-react';
import type { KpiDefault } from '@/lib/types/database';

interface EditState {
  [key: string]: string;
}

interface SavingState {
  [key: string]: boolean;
}

export default function AdminKpiPage() {
  const [defaults, setDefaults] = useState<KpiDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<EditState>({});
  const [saving, setSaving] = useState<SavingState>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadDefaults();
  }, []);

  async function loadDefaults() {
    setLoading(true);
    const res = await fetch('/api/kpi/defaults');
    if (res.ok) {
      const data: KpiDefault[] = await res.json();
      setDefaults(data);
      const initial: EditState = {};
      data.forEach((d) => {
        initial[d.kpi_key] = String(d.default_value);
      });
      setEditValues(initial);
    }
    setLoading(false);
  }

  async function saveDefault(kpiKey: string) {
    const raw = editValues[kpiKey];
    const value = parseFloat(raw);
    if (isNaN(value)) return;

    setSaving((prev) => ({ ...prev, [kpiKey]: true }));

    const res = await fetch(`/api/kpi/defaults/${kpiKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });

    if (res.ok) {
      const updated: KpiDefault = await res.json();
      setDefaults((prev) =>
        prev.map((d) => (d.kpi_key === kpiKey ? updated : d))
      );
      setSaved((prev) => ({ ...prev, [kpiKey]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [kpiKey]: false })), 2000);
    }

    setSaving((prev) => ({ ...prev, [kpiKey]: false }));
  }

  function resetValue(kpiKey: string) {
    const original = defaults.find((d) => d.kpi_key === kpiKey);
    if (original) {
      setEditValues((prev) => ({ ...prev, [kpiKey]: String(original.default_value) }));
    }
  }

  function isDirty(kpiKey: string): boolean {
    const original = defaults.find((d) => d.kpi_key === kpiKey);
    if (!original) return false;
    return editValues[kpiKey] !== String(original.default_value);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-[#E31B23] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="VERWALTUNG"
        title="KPI Einstellungen"
        description="Standard-Zielwerte für alle Agenturen. Agenturspezifische Abweichungen werden im Kundenprofil festgelegt."
        counter={`${defaults.length} KPIs`}
      />

      <Card padding="sm" className="!p-0 overflow-hidden">
        <div className="divide-y divide-[var(--border-default)]">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_100px_140px] gap-6 px-6 py-4 bg-[var(--surface-subtle)]">
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">KPI</span>
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">Standardwert</span>
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">Einheit</span>
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">Richtung</span>
          </div>

          {defaults.map((kpi) => {
            const dirty = isDirty(kpi.kpi_key);
            const isSaving = saving[kpi.kpi_key];
            const wasSaved = saved[kpi.kpi_key];

            return (
              <div
                key={kpi.kpi_key}
                className="grid grid-cols-[1fr_140px_100px_140px] gap-6 items-center px-6 py-5 hover:bg-[var(--surface-subtle)] transition-colors"
              >
                {/* Label + key */}
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">{kpi.label}</p>
                  <p className="text-[13px] text-[var(--text-tertiary)] font-mono mt-0.5">{kpi.kpi_key}</p>
                </div>

                {/* Inline edit input */}
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={editValues[kpi.kpi_key] ?? ''}
                    onChange={(e) =>
                      setEditValues((prev) => ({ ...prev, [kpi.kpi_key]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && dirty) saveDefault(kpi.kpi_key);
                      if (e.key === 'Escape') resetValue(kpi.kpi_key);
                    }}
                    className="w-24 !h-8 text-[13px]"
                    inputSize="md"
                  />
                  {dirty && (
                    <button
                      onClick={() => resetValue(kpi.kpi_key)}
                      className="p-1 hover:bg-gray-100 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                      title="Zurücksetzen"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Unit */}
                <span className="text-[14px] text-[var(--text-secondary)]">{kpi.unit}</span>

                {/* Direction + save action */}
                <div className="flex items-center gap-2">
                  <Badge tone={kpi.direction === 'higher_is_better' ? 'success' : 'neutral'}>
                    {kpi.direction === 'higher_is_better' ? 'Höher besser' : 'Niedriger besser'}
                  </Badge>
                  {dirty && (
                    <Button
                      size="sm"
                      onClick={() => saveDefault(kpi.kpi_key)}
                      disabled={isSaving}
                      className="ml-auto shrink-0"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? '...' : 'Speichern'}
                    </Button>
                  )}
                  {wasSaved && !dirty && (
                    <span className="text-[12px] text-green-600 font-medium ml-auto">Gespeichert</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-[14px] text-[var(--text-tertiary)] mt-8">
        Tipp: Enter zum Speichern, Escape zum Zurücksetzen.
      </p>
    </div>
  );
}
