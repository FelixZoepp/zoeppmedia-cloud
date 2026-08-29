'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import {
  FileText,
  Check,
  Send,
  Eye,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Report {
  id: string;
  agency_id: string;
  typ: 'tag_7' | 'tag_14' | 'monat' | 'zufriedenheit';
  stichtag: string;
  status: 'generiert' | 'freigegeben' | 'versendet';
  daten_json: Record<string, unknown>;
  pdf_url: string | null;
  freigegeben_von: string | null;
  freigegeben_am: string | null;
  versendet_am: string | null;
  created_at: string;
  agencies: { id: string; name: string } | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TYP_LABELS: Record<string, string> = {
  tag_7: 'Tag-7',
  tag_14: 'Tag-14',
  monat: 'Monat',
  zufriedenheit: 'Zufriedenheit',
};

const STATUS_TONES: Record<string, 'neutral' | 'softAccent' | 'success'> = {
  generiert: 'neutral',
  freigegeben: 'softAccent',
  versendet: 'success',
};

const STATUS_LABELS: Record<string, string> = {
  generiert: 'Generiert',
  freigegeben: 'Freigegeben',
  versendet: 'Versendet',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatEuro(val: number): string {
  return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/* ------------------------------------------------------------------ */
/*  Report Detail View                                                 */
/* ------------------------------------------------------------------ */

function ReportDetail({ daten, typ }: { daten: Record<string, unknown>; typ: string }) {
  if (typ === 'tag_7') {
    const d = daten as Record<string, unknown>;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
        <MetricCard label="Spend" value={formatEuro(d.spend as number)} />
        <MetricCard label="Impressionen" value={String(d.impressionen)} />
        <MetricCard label="Klicks" value={String(d.klicks)} />
        <MetricCard label="Leads" value={String(d.leads)} />
        <MetricCard label="CPL" value={formatEuro(d.cpl as number)} />
        <MetricCard label="Bewerbungen" value={String(d.bewerbungen)} />
        <MetricCard label="Termine" value={String(d.termine)} />
        <MetricCard label="Zeitraum" value={d.zeitraum as string} />
      </div>
    );
  }

  if (typ === 'tag_14') {
    const d = daten as Record<string, unknown>;
    return (
      <div className="space-y-4 mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricCard label="Spend W1" value={formatEuro(d.spend_w1 as number)} />
          <MetricCard label="Spend W2" value={formatEuro(d.spend_w2 as number)} delta={d.spend_delta as string} />
          <MetricCard label="Leads W1" value={String(d.leads_w1)} />
          <MetricCard label="Leads W2" value={String(d.leads_w2)} delta={d.leads_delta as string} />
          <MetricCard label="Terminquote" value={d.terminquote as string} />
          <MetricCard label="Show-Rate" value={d.show_rate as string} />
        </div>
        {typeof d.empfehlung_budget === 'string' && d.empfehlung_budget && (
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Budget-Empfehlung</p>
            <p className="text-sm text-green-900">{d.empfehlung_budget}</p>
          </div>
        )}
        {typeof d.empfehlung_creatives === 'string' && d.empfehlung_creatives && (
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Creative-Empfehlung</p>
            <p className="text-sm text-blue-900">{d.empfehlung_creatives}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-4 mt-4 overflow-x-auto">
      {JSON.stringify(daten, null, 2)}
    </pre>
  );
}

function MetricCard({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">
        {value}
        {delta && (
          <span className={`text-sm font-medium ml-2 ${delta.startsWith('+') ? 'text-green-600' : delta.startsWith('-') ? 'text-red-600' : 'text-gray-500'}`}>
            {delta}
          </span>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Report Row                                                         */
/* ------------------------------------------------------------------ */

function ReportRow({
  report,
  onApprove,
  onSend,
}: {
  report: Report;
  onApprove: (id: string) => Promise<void>;
  onSend: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);

  async function handleAction(action: () => Promise<void>) {
    setProcessing(true);
    try {
      await action();
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Card padding="sm" className="space-y-2">
      <div className="flex items-center gap-3">
        <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {report.agencies?.name || 'Unbekannt'}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge tone="outline">{TYP_LABELS[report.typ] || report.typ}</Badge>
            <span className="text-xs text-gray-400">{formatDate(report.stichtag)}</span>
          </div>
        </div>

        <Badge tone={STATUS_TONES[report.status] || 'neutral'}>
          {STATUS_LABELS[report.status] || report.status}
        </Badge>

        <div className="flex items-center gap-2 flex-shrink-0">
          {report.status === 'generiert' && (
            <Button
              size="sm"
              onClick={() => handleAction(() => onApprove(report.id))}
              disabled={processing}
            >
              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Freigeben
            </Button>
          )}

          {report.status === 'freigegeben' && (
            <Button
              size="sm"
              onClick={() => handleAction(() => onSend(report.id))}
              disabled={processing}
            >
              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Versenden
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Timestamps */}
      {(report.freigegeben_am || report.versendet_am) && (
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {report.freigegeben_am && <span>Freigegeben: {formatDate(report.freigegeben_am)}</span>}
          {report.versendet_am && <span>Versendet: {formatDate(report.versendet_am)}</span>}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && report.daten_json && (
        <ReportDetail daten={report.daten_json} typ={report.typ} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function ReportsClient() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterTyp, setFilterTyp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTyp) params.set('typ', filterTyp);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setReports(data);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [filterTyp, filterStatus]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function handleApprove(id: string) {
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || 'Freigabe fehlgeschlagen');
      return;
    }
    toast.success('Report freigegeben');
    fetchReports();
  }

  async function handleSend(id: string) {
    const res = await fetch(`/api/admin/reports/${id}/send`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || 'Versand fehlgeschlagen');
      return;
    }
    toast.success('Report versendet');
    fetchReports();
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        label="VERWALTUNG"
        title="Reports"
        description="Tag-7 und Tag-14 Reports verwalten, freigeben und versenden"
        counter={`${reports.length} Reports`}
      />

      {/* Filters */}
      <Card padding="sm" className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filter:</span>
          </div>
          <Select
            value={filterTyp}
            onChange={(e) => setFilterTyp(e.target.value)}
            options={[
              { value: '', label: 'Alle Typen' },
              { value: 'tag_7', label: 'Tag-7' },
              { value: 'tag_14', label: 'Tag-14' },
              { value: 'monat', label: 'Monat' },
              { value: 'zufriedenheit', label: 'Zufriedenheit' },
            ]}
            className="w-40"
          />
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: '', label: 'Alle Status' },
              { value: 'generiert', label: 'Generiert' },
              { value: 'freigegeben', label: 'Freigegeben' },
              { value: 'versendet', label: 'Versendet' },
            ]}
            className="w-40"
          />
        </div>
      </Card>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <Card padding="lg" className="text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Keine Reports</h2>
          <p className="text-gray-600">
            Es sind noch keine Reports vorhanden. Reports werden automatisch generiert wenn eine Agentur den 7. oder 14. Tag erreicht.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              onApprove={handleApprove}
              onSend={handleSend}
            />
          ))}
        </div>
      )}
    </div>
  );
}
