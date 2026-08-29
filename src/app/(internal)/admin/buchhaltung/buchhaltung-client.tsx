'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Receipt,
  FileText,
  CreditCard,
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Play,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Agency {
  id: string;
  name: string;
}

interface BillingRun {
  id: string;
  agency_id: string;
  plan_id: string;
  periode: string;
  lex_invoice_number: string | null;
  betrag_netto: number;
  betrag_brutto: number;
  ust_betrag: number;
  status: string;
  fehlergrund: string | null;
  erstellt_am: string;
  bezahlt_am: string | null;
  agencies: Agency | null;
}

interface Mandate {
  id: string;
  agency_id: string;
  provider: string;
  provider_customer_id: string | null;
  provider_mandate_id: string | null;
  status: string;
  erteilt_am: string | null;
  created_at: string;
  updated_at: string;
  agencies: Agency | null;
}

interface BillingPlan {
  id: string;
  agency_id: string;
  typ: string;
  betrag_netto: number;
  ust_satz: number;
  rhythmus: string;
  faelligkeitstag: number;
  start_datum: string;
  ende_datum: string | null;
  status: string;
  created_at: string;
  agencies: Agency | null;
}

interface OverviewData {
  offene_rechnungen: { count: number; betrag: number };
  bezahlt_monat: { count: number; betrag: number };
  fehlgeschlagen: { count: number };
  mrr: number;
  rechnungen: BillingRun[];
  mandate: Mandate[];
  plaene: BillingPlan[];
  agencies: Agency[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatEuro(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const STATUS_CONFIG: Record<string, { tone: 'neutral' | 'softAccent' | 'success' | 'accent' | 'outline'; label: string; strikethrough?: boolean }> = {
  offen: { tone: 'neutral', label: 'Offen' },
  rechnung_erstellt: { tone: 'outline', label: 'Rechnung erstellt' },
  zahlung_angestossen: { tone: 'softAccent', label: 'Zahlung angestossen' },
  bezahlt: { tone: 'success', label: 'Bezahlt' },
  fehlgeschlagen: { tone: 'accent', label: 'Fehlgeschlagen' },
  storniert: { tone: 'neutral', label: 'Storniert', strikethrough: true },
};

const MANDATE_STATUS_CONFIG: Record<string, { tone: 'neutral' | 'softAccent' | 'success' | 'accent' | 'outline'; label: string }> = {
  angefragt: { tone: 'softAccent', label: 'Angefragt' },
  gueltig: { tone: 'success', label: 'Gueltig' },
  widerrufen: { tone: 'accent', label: 'Widerrufen' },
  fehlgeschlagen: { tone: 'accent', label: 'Fehlgeschlagen' },
};

const PLAN_STATUS_CONFIG: Record<string, { tone: 'neutral' | 'softAccent' | 'success' | 'accent' | 'outline'; label: string }> = {
  aktiv: { tone: 'success', label: 'Aktiv' },
  pausiert: { tone: 'softAccent', label: 'Pausiert' },
  beendet: { tone: 'neutral', label: 'Beendet' },
};

/* ------------------------------------------------------------------ */
/*  KPI Card                                                           */
/* ------------------------------------------------------------------ */

function KpiCard({
  icon,
  iconColor,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 p-2.5 rounded-xl ${iconColor}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status, config }: { status: string; config: Record<string, { tone: 'neutral' | 'softAccent' | 'success' | 'accent' | 'outline'; label: string; strikethrough?: boolean }> }) {
  const cfg = config[status] ?? { tone: 'neutral' as const, label: status };
  return (
    <Badge tone={cfg.tone}>
      <span className={cfg.strikethrough ? 'line-through' : ''}>
        {cfg.label}
      </span>
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Create Plan Modal                                                  */
/* ------------------------------------------------------------------ */

function PlanModal({
  open,
  onClose,
  agencies,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  agencies: Agency[];
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [agencyId, setAgencyId] = useState('');
  const [typ, setTyp] = useState('retainer');
  const [betragNetto, setBetragNetto] = useState('');
  const [ustSatz, setUstSatz] = useState('19');
  const [rhythmus, setRhythmus] = useState('monatlich');
  const [faelligkeitstag, setFaelligkeitstag] = useState('1');
  const [startDatum, setStartDatum] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyId || !betragNetto || !startDatum) {
      toast.error('Bitte alle Pflichtfelder ausfuellen');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_id: agencyId,
          typ,
          betrag_netto: parseFloat(betragNetto),
          ust_satz: parseFloat(ustSatz),
          rhythmus,
          faelligkeitstag: parseInt(faelligkeitstag, 10),
          start_datum: startDatum,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Fehler beim Erstellen');
        return;
      }

      toast.success('Zahlungsplan erstellt');
      onCreated();
      onClose();
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Zahlungsplan anlegen">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kunde *</label>
          <Select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            options={[
              { value: '', label: 'Agentur waehlen...' },
              ...agencies.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typ *</label>
            <Select
              value={typ}
              onChange={(e) => setTyp(e.target.value)}
              options={[
                { value: 'retainer', label: 'Retainer' },
                { value: 'setup', label: 'Setup' },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rhythmus *</label>
            <Select
              value={rhythmus}
              onChange={(e) => setRhythmus(e.target.value)}
              options={[
                { value: 'monatlich', label: 'Monatlich' },
                { value: 'einmalig', label: 'Einmalig' },
              ]}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Betrag netto *</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="z.B. 2500.00"
              value={betragNetto}
              onChange={(e) => setBetragNetto(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">USt-Satz (%)</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={ustSatz}
              onChange={(e) => setUstSatz(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Faelligkeitstag</label>
            <Input
              type="number"
              min="1"
              max="28"
              value={faelligkeitstag}
              onChange={(e) => setFaelligkeitstag(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Startdatum *</label>
            <Input
              type="date"
              value={startDatum}
              onChange={(e) => setStartDatum(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Plan erstellen
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Mandate Modal                                                      */
/* ------------------------------------------------------------------ */

function MandateModal({
  open,
  onClose,
  agencies,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  agencies: Agency[];
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [agencyId, setAgencyId] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyId) {
      toast.error('Bitte eine Agentur waehlen');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/billing/mandate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_id: agencyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Fehler beim Erstellen');
        return;
      }

      if (data.checkout_url) {
        window.open(data.checkout_url, '_blank');
        toast.success('Mandat-Checkout geoeffnet');
      } else {
        toast.success('Mandat angefordert');
      }

      onCreated();
      onClose();
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mandat anfordern">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kunde *</label>
          <Select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            options={[
              { value: '', label: 'Agentur waehlen...' },
              ...agencies.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
        <p className="text-xs text-gray-500">
          Es wird eine Mollie-Erstabbuchung von 0,01 EUR ausgeloest, um das SEPA-Mandat einzurichten.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Mandat anfordern
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Billing Run Modal                                                  */
/* ------------------------------------------------------------------ */

function BillingRunModal({
  open,
  onClose,
  agencies,
  plaene,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  agencies: Agency[];
  plaene: BillingPlan[];
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  const [planId, setPlanId] = useState('');
  const [periode, setPeriode] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Filter plans to only active ones
  const activePlans = plaene.filter((p) => p.status === 'aktiv');

  function toggleAgency(id: string) {
    setSelectedAgencies((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedAgencies.length === 0 || !planId || !periode) {
      toast.error('Bitte alle Felder ausfuellen');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/billing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_ids: selectedAgencies,
          plan_id: planId,
          periode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Fehler beim Abrechnungslauf');
        return;
      }

      const results = data.results as Array<{ agency_id: string; status: string; error?: string }>;
      const errors = results.filter((r) => r.status === 'fehler');
      if (errors.length > 0) {
        toast.error(`${errors.length} Fehler beim Abrechnungslauf`);
      } else {
        toast.success(`Abrechnungslauf fuer ${results.length} Agenturen gestartet`);
      }

      onCreated();
      onClose();
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Abrechnungslauf starten" width="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan *</label>
            <Select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              options={[
                { value: '', label: 'Plan waehlen...' },
                ...activePlans.map((p) => ({
                  value: p.id,
                  label: `${p.agencies?.name || 'Unbekannt'} — ${p.typ === 'setup' ? 'Setup' : 'Retainer'} (${formatEuro(p.betrag_netto)})`,
                })),
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Periode *</label>
            <Input
              type="month"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Agenturen *</label>
          <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
            {agencies.map((a) => (
              <label
                key={a.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedAgencies.includes(a.id)}
                  onChange={() => toggleAgency(a.id)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-gray-900">{a.name}</span>
              </label>
            ))}
          </div>
          {selectedAgencies.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">{selectedAgencies.length} ausgewaehlt</p>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Abrechnungslauf starten
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

const TABS = [
  { value: 'rechnungen', label: 'Rechnungen' },
  { value: 'mandate', label: 'Mandate' },
  { value: 'plaene', label: 'Zahlungsplaene' },
];

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function BuchhaltungClient() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('rechnungen');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');

  // Modals
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [mandateModalOpen, setMandateModalOpen] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/billing/overview');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('Fehler beim Laden der Buchhaltungsdaten');
      }
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="max-w-6xl">
        <PageHeader
          label="FINANZEN"
          title="Buchhaltung"
          description="Rechnungen, Mandate und Zahlungsplaene verwalten"
        />
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Filter rechnungen
  const filteredRechnungen = data.rechnungen.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (agencyFilter && r.agency_id !== agencyFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="FINANZEN"
        title="Buchhaltung"
        description="Rechnungen, Mandate und Zahlungsplaene verwalten"
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRunModalOpen(true)}>
              <Play className="w-3.5 h-3.5" />
              Abrechnungslauf
            </Button>
            <Button size="sm" variant="primary" onClick={() => setPlanModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              Plan anlegen
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={<FileText className="w-5 h-5 text-amber-600" />}
          iconColor="bg-amber-50"
          label="Offene Rechnungen"
          value={formatEuro(data.offene_rechnungen.betrag)}
          sub={`${data.offene_rechnungen.count} Rechnungen`}
        />
        <KpiCard
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          iconColor="bg-green-50"
          label="Bezahlt diesen Monat"
          value={formatEuro(data.bezahlt_monat.betrag)}
          sub={`${data.bezahlt_monat.count} Zahlungen`}
        />
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          iconColor="bg-red-50"
          label="Fehlgeschlagen"
          value={String(data.fehlgeschlagen.count)}
          sub="Rechnungen mit Fehler"
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
          iconColor="bg-blue-50"
          label="MRR"
          value={formatEuro(data.mrr)}
          sub="Monatlich wiederkehrend"
        />
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <SegmentedControl
          items={TABS}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* Rechnungen Tab */}
      {tab === 'rechnungen' && (
        <>
          {/* Filter Bar */}
          <Card padding="sm" className="mb-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Filter:</span>
              </div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: '', label: 'Alle Status' },
                  { value: 'offen', label: 'Offen' },
                  { value: 'rechnung_erstellt', label: 'Rechnung erstellt' },
                  { value: 'zahlung_angestossen', label: 'Zahlung angestossen' },
                  { value: 'bezahlt', label: 'Bezahlt' },
                  { value: 'fehlgeschlagen', label: 'Fehlgeschlagen' },
                  { value: 'storniert', label: 'Storniert' },
                ]}
                className="w-52"
              />
              <Select
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
                options={[
                  { value: '', label: 'Alle Kunden' },
                  ...data.agencies.map((a) => ({ value: a.id, label: a.name })),
                ]}
                className="w-52"
              />
            </div>
          </Card>

          {/* Rechnungen Table */}
          <Card padding="none" className="overflow-hidden">
            {filteredRechnungen.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400 text-sm">Keine Rechnungen gefunden.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kunde</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rechnungsnr.</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Periode</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Netto</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Brutto</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Erstellt</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bezahlt am</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRechnungen.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {r.agencies?.name || 'Unbekannt'}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600 font-mono">
                          {r.lex_invoice_number || '--'}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600">
                          {r.periode}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                          {formatEuro(r.betrag_netto)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                          {formatEuro(r.betrag_brutto)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <StatusBadge status={r.status} config={STATUS_CONFIG} />
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(r.erstellt_am)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(r.bezahlt_am)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Mandate Tab */}
      {tab === 'mandate' && (
        <>
          <div className="flex justify-end mb-4">
            <Button size="sm" variant="secondary" onClick={() => setMandateModalOpen(true)}>
              <CreditCard className="w-3.5 h-3.5" />
              Mandat anfordern
            </Button>
          </div>
          <Card padding="none" className="overflow-hidden">
            {data.mandate.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400 text-sm">Keine Mandate vorhanden.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kunde</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Provider</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Erteilt am</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Letzte Pruefung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.mandate.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {m.agencies?.name || 'Unbekannt'}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <Badge tone="outline">{m.provider}</Badge>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <StatusBadge status={m.status} config={MANDATE_STATUS_CONFIG} />
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(m.erteilt_am)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(m.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Zahlungsplaene Tab */}
      {tab === 'plaene' && (
        <>
          <div className="flex justify-end mb-4">
            <Button size="sm" variant="primary" onClick={() => setPlanModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              Plan anlegen
            </Button>
          </div>
          <Card padding="none" className="overflow-hidden">
            {data.plaene.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400 text-sm">Keine Zahlungsplaene vorhanden.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kunde</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Typ</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Betrag netto</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">USt</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rhythmus</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Faelligkeitstag</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Start</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.plaene.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {p.agencies?.name || 'Unbekannt'}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <Badge tone={p.typ === 'setup' ? 'softAccent' : 'outline'}>
                            {p.typ === 'setup' ? 'Setup' : 'Retainer'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                          {formatEuro(p.betrag_netto)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                          {p.ust_satz}%
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600 capitalize">
                          {p.rhythmus}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600">
                          {p.faelligkeitstag}. des Monats
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(p.start_datum)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <StatusBadge status={p.status} config={PLAN_STATUS_CONFIG} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Modals */}
      <PlanModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        agencies={data.agencies}
        onCreated={fetchData}
      />
      <MandateModal
        open={mandateModalOpen}
        onClose={() => setMandateModalOpen(false)}
        agencies={data.agencies}
        onCreated={fetchData}
      />
      <BillingRunModal
        open={runModalOpen}
        onClose={() => setRunModalOpen(false)}
        agencies={data.agencies}
        plaene={data.plaene}
        onCreated={fetchData}
      />
    </div>
  );
}
