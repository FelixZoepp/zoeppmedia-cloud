'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import type { AgencyOverviewRow, Ampel } from '@/lib/kpi/agency-overview';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

interface MetaPricingRow {
  id: string;
  category: string;
  price_eur: number;
  updated_at: string;
}

interface OverviewPayload {
  agencies: AgencyOverviewRow[];
  month: string;
}

interface PricingPayload {
  pricing: MetaPricingRow[];
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function ampelDot(ampel: Ampel) {
  const cls =
    ampel === 'gruen'
      ? 'bg-green-500'
      : ampel === 'gelb'
      ? 'bg-yellow-400'
      : 'bg-red-500';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls} shrink-0`} />;
}

function fmtPct(val: number | null): string {
  if (val === null) return '–';
  return (val * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + '\u00a0%';
}

function fmtNum(val: number): string {
  return val.toLocaleString('de-DE');
}

function fmtEur(val: number): string {
  return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0€';
}

function fmtUsd(val: number): string {
  return '$\u00a0' + val.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function relativeDays(isoOrNull: string | null): string {
  if (!isoOrNull) return '–';
  const diffMs = Date.now() - new Date(isoOrNull).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'heute';
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}

function templatesSummary(cats: Record<string, number>): string {
  const entries = Object.entries(cats).filter(([, v]) => v > 0);
  if (entries.length === 0) return '–';
  return entries.map(([cat, cnt]) => `${cat} ${cnt}`).join(' · ');
}

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export function RecruitingOverviewView() {
  const [agencies, setAgencies] = useState<AgencyOverviewRow[]>([]);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);

  const [pricing, setPricing] = useState<MetaPricingRow[]>([]);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingEdit, setPricingEdit] = useState<Record<string, string>>({});
  const [pricingSaving, setPricingSaving] = useState<Record<string, boolean>>({});

  // --- Daten laden ---
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch('/api/admin/recruiting-overview');
      if (res.ok) {
        const data: OverviewPayload = await res.json();
        setAgencies(data.agencies);
        setMonth(data.month);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadPricing() {
      setPricingLoading(true);
      const res = await fetch('/api/admin/meta-pricing');
      if (res.ok) {
        const data: PricingPayload = await res.json();
        setPricing(data.pricing);
        const initial: Record<string, string> = {};
        data.pricing.forEach((p) => {
          initial[p.category] = String(p.price_eur);
        });
        setPricingEdit(initial);
      }
      setPricingLoading(false);
    }
    loadPricing();
  }, []);

  // --- Meta-Preis speichern ---
  async function savePricing(category: string) {
    const raw = pricingEdit[category];
    // Deutsches Komma tolerieren ("0,14" → 0.14), sonst würde parseFloat still bei 0 abschneiden
    const price_eur = parseFloat(raw.replace(',', '.'));
    if (isNaN(price_eur)) return;

    setPricingSaving((prev) => ({ ...prev, [category]: true }));

    const res = await fetch('/api/admin/meta-pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, price_eur }),
    });

    if (res.ok) {
      const data: { pricing: MetaPricingRow } = await res.json();
      setPricing((prev) =>
        prev.map((p) => (p.category === category ? data.pricing : p))
      );
      toast.success('Preis gespeichert');
    } else {
      toast.error('Speichern fehlgeschlagen');
    }

    setPricingSaving((prev) => ({ ...prev, [category]: false }));
  }

  function pricingIsDirty(category: string): boolean {
    const original = pricing.find((p) => p.category === category);
    if (!original) return false;
    return pricingEdit[category] !== String(original.price_eur);
  }

  // ---------------------------------------------------------------------------
  // Alarme aller Agenturen flach sammeln
  // ---------------------------------------------------------------------------
  const allAlarms = agencies.flatMap((a) =>
    a.alarms.map((alarm) => ({ agency: a.name, alarm }))
  );

  // ---------------------------------------------------------------------------
  // Render: Ladestand
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  const monthLabel = month
    ? new Date(month + 'T00:00:00').toLocaleString('de-DE', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="max-w-7xl space-y-8">
      <PageHeader
        label="RECRUITING-CLOUD"
        title="Kunden-Übersicht"
        description="Zustand, Verbrauch und Alarme aller Mandanten"
        counter={`${agencies.length} Agenturen`}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Alarme-Panel                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="sm">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
          Aktive Alarme
        </h2>
        {allAlarms.length === 0 ? (
          <p className="text-sm text-gray-400">Keine aktiven Alarme</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allAlarms.map(({ agency, alarm }, idx) => (
              <Badge key={idx} tone="accent">
                {agency}: {alarm.label}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Kunden-Tabelle                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="sm" className="!p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
            Kunden-Übersicht
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Agentur</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Aktive Jobs</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Bew. 7&nbsp;T</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Bew. 30&nbsp;T</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Antwortquote</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Qualifizierung</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Termine 30&nbsp;T</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Letzte Aktivität</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">WA-Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">WA-Qualität</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">WA-Limit</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Abgel. Vorlagen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agencies.map((a) => (
                <tr key={a.agencyId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{a.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {ampelDot(a.ampel)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtNum(a.activeJobs)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtNum(a.apps7)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtNum(a.apps30)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtPct(a.antwortquote30)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtPct(a.qualifizierungsquote30)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtNum(a.termine30)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{relativeDays(a.letzteAktivitaet)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.whatsapp.status ?? '–'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.whatsapp.qualityRating ?? '–'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{a.whatsapp.messagingLimit ?? '–'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {a.whatsapp.rejectedTemplates > 0 ? (
                      <Badge tone="softAccent">{a.whatsapp.rejectedTemplates}</Badge>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
              {agencies.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-sm text-gray-400">
                    Keine Agenturen gefunden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Verbrauch & Kosten (laufender Monat)                                */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="sm" className="!p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
            Verbrauch &amp; Kosten (laufender Monat){monthLabel ? ` — ${monthLabel}` : ''}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Agentur</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Nachrichten ausgehend</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Vorlagen</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Meta-Kosten</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">KI-Tokens (ein/aus)</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">KI-Kosten</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agencies.map((a) => (
                <tr key={a.agencyId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{a.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtNum(a.usageMonth.messagesOut)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{templatesSummary(a.usageMonth.templatesByCategory)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtEur(a.usageMonth.metaCostEur)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {fmtNum(a.usageMonth.aiInputTokens)}&nbsp;/&nbsp;{fmtNum(a.usageMonth.aiOutputTokens)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtUsd(a.usageMonth.aiCostUsd)}</td>
                </tr>
              ))}
              {agencies.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    Keine Daten
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Meta-Preistabelle                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="sm" className="!p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
            Meta-Preistabelle
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Preis je Template-Kategorie in Euro</p>
        </div>

        {pricingLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-6 h-6 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Header */}
            <div className="grid grid-cols-[1fr_180px_120px] gap-4 px-5 py-3 bg-gray-50">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Kategorie</span>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Preis (€)</span>
              <span />
            </div>

            {pricing.map((row) => {
              const dirty = pricingIsDirty(row.category);
              const saving = pricingSaving[row.category] ?? false;

              return (
                <div
                  key={row.category}
                  className="grid grid-cols-[1fr_180px_120px] gap-4 items-center px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900">{row.category}</span>

                  <Input
                    type="number"
                    step="0.001"
                    value={pricingEdit[row.category] ?? ''}
                    onChange={(e) =>
                      setPricingEdit((prev) => ({ ...prev, [row.category]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && dirty) savePricing(row.category);
                    }}
                    className="!h-8"
                    inputSize="md"
                  />

                  <div className="flex justify-end">
                    {dirty && (
                      <Button
                        size="sm"
                        onClick={() => savePricing(row.category)}
                        disabled={saving}
                      >
                        {saving ? '...' : 'Speichern'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {pricing.length === 0 && (
              <div className="px-5 py-6 text-sm text-gray-400">
                Keine Preiskategorien konfiguriert
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
