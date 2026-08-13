'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Save, RotateCcw, Plus, Trash2 } from 'lucide-react';
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
  const [modalOpen, setModalOpen] = useState(false);
  const [newKpi, setNewKpi] = useState({ kpi_key: '', label: '', default_value: '', unit: '', direction: 'higher_is_better' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

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

  async function handleCreateKpi(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');

    const res = await fetch('/api/kpi/defaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kpi_key: newKpi.kpi_key.trim(),
        label: newKpi.label.trim(),
        default_value: parseFloat(newKpi.default_value),
        unit: newKpi.unit.trim(),
        direction: newKpi.direction,
      }),
    });

    if (res.ok) {
      setModalOpen(false);
      setNewKpi({ kpi_key: '', label: '', default_value: '', unit: '', direction: 'higher_is_better' });
      await loadDefaults();
    } else {
      const data = await res.json();
      setCreateError(data.error || 'Fehler beim Erstellen');
    }

    setCreating(false);
  }

  async function handleDeleteKpi(kpiKey: string, label: string) {
    if (!confirm(`KPI "${label}" wirklich löschen?`)) return;
    const res = await fetch(`/api/kpi/defaults/${kpiKey}`, { method: 'DELETE' });
    if (res.ok) {
      setDefaults((prev) => prev.filter((d) => d.kpi_key !== kpiKey));
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[kpiKey];
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
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
        action={
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Neuer KPI
          </Button>
        }
      />

      <Card padding="sm" className="!p-0 overflow-hidden">
        <div className="divide-y divide-gray-200">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_100px_140px_40px] gap-4 px-4 py-3 bg-gray-50">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">KPI</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Standardwert</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Einheit</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Richtung</span>
            <span />
          </div>

          {defaults.map((kpi) => {
            const dirty = isDirty(kpi.kpi_key);
            const isSaving = saving[kpi.kpi_key];
            const wasSaved = saved[kpi.kpi_key];

            return (
              <div
                key={kpi.kpi_key}
                className="grid grid-cols-[1fr_140px_100px_140px_40px] gap-4 items-center px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                {/* Label + key */}
                <div>
                  <p className="text-sm font-medium text-gray-900">{kpi.label}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{kpi.kpi_key}</p>
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
                    className="w-24 !h-8 text-xs"
                    inputSize="md"
                  />
                  {dirty && (
                    <button
                      onClick={() => resetValue(kpi.kpi_key)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                      title="Zurücksetzen"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Unit */}
                <span className="text-sm text-gray-600">{kpi.unit}</span>

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
                    <span className="text-xs text-green-600 font-medium ml-auto">Gespeichert</span>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteKpi(kpi.kpi_key, kpi.label)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  title="Löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-sm text-gray-400 mt-8">
        Tipp: Enter zum Speichern, Escape zum Zurücksetzen.
      </p>

      {/* New KPI Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Neuer KPI">
        <form onSubmit={handleCreateKpi} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">KPI-Key (Slug)</label>
            <Input
              value={newKpi.kpi_key}
              onChange={(e) => setNewKpi((k) => ({ ...k, kpi_key: e.target.value }))}
              placeholder="z.B. cost_per_lead"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Label</label>
            <Input
              value={newKpi.label}
              onChange={(e) => setNewKpi((k) => ({ ...k, label: e.target.value }))}
              placeholder="z.B. Cost per Lead"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Standardwert</label>
              <Input
                type="number"
                value={newKpi.default_value}
                onChange={(e) => setNewKpi((k) => ({ ...k, default_value: e.target.value }))}
                placeholder="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Einheit</label>
              <Input
                value={newKpi.unit}
                onChange={(e) => setNewKpi((k) => ({ ...k, unit: e.target.value }))}
                placeholder="z.B. EUR, %, Tage"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Richtung</label>
            <Select
              value={newKpi.direction}
              onChange={(e) => setNewKpi((k) => ({ ...k, direction: e.target.value }))}
              options={[
                { value: 'higher_is_better', label: 'Höher ist besser' },
                { value: 'lower_is_better', label: 'Niedriger ist besser' },
              ]}
            />
          </div>

          {createError && <p className="text-sm text-red-600">{createError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? 'Erstellt...' : 'KPI erstellen'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
