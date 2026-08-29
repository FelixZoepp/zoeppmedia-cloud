'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import {
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HealthCheck {
  id: string;
  agency_id: string;
  typ: string;
  gelaufen_am: string;
  ergebnis: 'ok' | 'warnung' | 'fehler';
  details: Record<string, unknown>;
}

interface AgencyHealth {
  agency_id: string;
  agency_name: string;
  agency_status: string;
  checks: HealthCheck[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CHECK_LABELS: Record<string, string> = {
  stille: 'Stille',
  werbekonto: 'Werbekonto',
  pixel: 'Pixel',
  canary_bewerbung: 'Canary',
};

const CHECK_TYPES = ['stille', 'werbekonto', 'pixel', 'canary_bewerbung'];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) +
    ', ' +
    d.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

function TrafficLight({ ergebnis }: { ergebnis?: 'ok' | 'warnung' | 'fehler' }) {
  if (!ergebnis) {
    return <div className="w-3 h-3 rounded-full bg-gray-200" title="Nicht geprueft" />;
  }
  if (ergebnis === 'ok') {
    return <div className="w-3 h-3 rounded-full bg-green-500" title="OK" />;
  }
  if (ergebnis === 'warnung') {
    return <div className="w-3 h-3 rounded-full bg-amber-400" title="Warnung" />;
  }
  return <div className="w-3 h-3 rounded-full bg-red-500" title="Fehler" />;
}

function ErgebnisIcon({ ergebnis }: { ergebnis: string }) {
  if (ergebnis === 'ok') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (ergebnis === 'warnung') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

const ERGEBNIS_TONES: Record<string, 'success' | 'softAccent' | 'accent'> = {
  ok: 'success',
  warnung: 'softAccent',
  fehler: 'accent',
};

const ERGEBNIS_LABELS: Record<string, string> = {
  ok: 'OK',
  warnung: 'Warnung',
  fehler: 'Fehler',
};

/* ------------------------------------------------------------------ */
/*  Agency Health Row                                                  */
/* ------------------------------------------------------------------ */

function AgencyRow({
  agency,
  onRunChecks,
}: {
  agency: AgencyHealth;
  onRunChecks: (agencyId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);

  // Map checks by typ
  const checkMap = new Map<string, HealthCheck>();
  for (const check of agency.checks) {
    checkMap.set(check.typ, check);
  }

  async function handleRun() {
    setRunning(true);
    try {
      await onRunChecks(agency.agency_id);
    } finally {
      setRunning(false);
    }
  }

  // Overall status: worst check result
  const hasError = agency.checks.some((c) => c.ergebnis === 'fehler');
  const hasWarning = agency.checks.some((c) => c.ergebnis === 'warnung');

  return (
    <Card padding="sm" className="space-y-2">
      <div className="flex items-center gap-3">
        {/* Overall status icon */}
        {hasError ? (
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        ) : hasWarning ? (
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
        )}

        {/* Agency name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{agency.agency_name}</p>
          <div className="flex items-center gap-2 mt-1">
            {CHECK_TYPES.map((typ) => (
              <div key={typ} className="flex items-center gap-1">
                <TrafficLight ergebnis={checkMap.get(typ)?.ergebnis} />
                <span className="text-xs text-gray-400">{CHECK_LABELS[typ]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRun}
            disabled={running}
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Jetzt pruefen
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-2 mt-3">
          {CHECK_TYPES.map((typ) => {
            const check = checkMap.get(typ);
            if (!check) {
              return (
                <div key={typ} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-200" />
                    <span className="text-sm font-medium text-gray-500">{CHECK_LABELS[typ]}</span>
                    <span className="text-xs text-gray-400 ml-auto">Noch nicht geprueft</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={typ} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ErgebnisIcon ergebnis={check.ergebnis} />
                  <span className="text-sm font-medium text-gray-900">{CHECK_LABELS[typ]}</span>
                  <Badge tone={ERGEBNIS_TONES[check.ergebnis] || 'neutral'}>
                    {ERGEBNIS_LABELS[check.ergebnis] || check.ergebnis}
                  </Badge>
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatDateTime(check.gelaufen_am)}
                  </span>
                </div>
                {check.details && (
                  <div className="text-xs text-gray-600 space-y-1">
                    {Object.entries(check.details).map(([key, value]) => (
                      <div key={key}>
                        <span className="font-medium text-gray-500">{key}:</span>{' '}
                        <span>{String(value ?? '--')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function HealthClient() {
  const [agencies, setAgencies] = useState<AgencyHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/health-checks');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setAgencies(data);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleRunChecks(agencyId: string) {
    const res = await fetch('/api/admin/health-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_id: agencyId }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || 'Health Check fehlgeschlagen');
      return;
    }
    toast.success('Health Checks ausgefuehrt');
    fetchData();
  }

  // Sort: agencies with errors first, then warnings, then ok
  const sorted = [...agencies].sort((a, b) => {
    const scoreA = a.checks.some((c) => c.ergebnis === 'fehler')
      ? 0
      : a.checks.some((c) => c.ergebnis === 'warnung')
        ? 1
        : 2;
    const scoreB = b.checks.some((c) => c.ergebnis === 'fehler')
      ? 0
      : b.checks.some((c) => c.ergebnis === 'warnung')
        ? 1
        : 2;
    return scoreA - scoreB;
  });

  const errorCount = agencies.filter((a) => a.checks.some((c) => c.ergebnis === 'fehler')).length;
  const warningCount = agencies.filter((a) => a.checks.some((c) => c.ergebnis === 'warnung')).length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        label="VERWALTUNG"
        title="Health Checks"
        description="Automatische Ueberwachung aller Agenturen — Pixel, Werbekonto, Bewerbungsflow"
        counter={
          errorCount > 0
            ? `${errorCount} Fehler`
            : warningCount > 0
              ? `${warningCount} Warnungen`
              : `${agencies.length} Agenturen`
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      ) : agencies.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Keine Agenturen</h2>
          <p className="text-gray-600">
            Es gibt noch keine aktiven Agenturen fuer Health Checks.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((agency) => (
            <AgencyRow
              key={agency.agency_id}
              agency={agency}
              onRunChecks={handleRunChecks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
