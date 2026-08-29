'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ArrowLeft, Save, Copy, ExternalLink, CreditCard, FileText, Shield, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Agency {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  anschrift: string;
  rechnungsmail: string;
  ust_id: string;
  rechtsform: string;
  paket: string;
  mrr: number;
  [key: string]: unknown;
}

interface BillingPlan {
  id: string;
  typ: string;
  betrag_netto: number;
  ust_satz: number;
  rhythmus: string;
  faelligkeitstag: number;
  start_datum: string;
  ende_datum: string | null;
  status: string;
}

interface Mandate {
  id: string;
  provider: string;
  provider_customer_id: string;
  provider_mandate_id: string;
  status: string;
  erteilt_am: string | null;
  checkout_url: string | null;
  checkout_freigegeben: boolean;
}

interface BillingRun {
  id: string;
  periode: string;
  lex_invoice_number: string;
  betrag_netto: number;
  betrag_brutto: number;
  status: string;
  freigabe_status: string;
  erstellt_am: string;
  bezahlt_am: string | null;
}

function fmtEur(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}

function statusBadge(status: string) {
  const map: Record<string, { tone: 'success' | 'accent' | 'neutral' | 'softAccent'; label: string }> = {
    aktiv: { tone: 'success', label: 'Aktiv' },
    entwurf: { tone: 'neutral', label: 'Entwurf' },
    pausiert: { tone: 'softAccent', label: 'Pausiert' },
    beendet: { tone: 'neutral', label: 'Beendet' },
    gueltig: { tone: 'success', label: 'Gültig' },
    angefragt: { tone: 'softAccent', label: 'Angefragt' },
    widerrufen: { tone: 'accent', label: 'Widerrufen' },
    fehlgeschlagen: { tone: 'accent', label: 'Fehlgeschlagen' },
    offen: { tone: 'neutral', label: 'Offen' },
    rechnung_erstellt: { tone: 'softAccent', label: 'Rechnung erstellt' },
    zahlung_angestossen: { tone: 'softAccent', label: 'Einzug läuft' },
    bezahlt: { tone: 'success', label: 'Bezahlt' },
    storniert: { tone: 'neutral', label: 'Storniert' },
    ausstehend: { tone: 'softAccent', label: 'Ausstehend' },
    freigegeben: { tone: 'success', label: 'Freigegeben' },
    abgelehnt: { tone: 'accent', label: 'Abgelehnt' },
  };
  const s = map[status] ?? { tone: 'neutral' as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function KundenDetailClient({ agencyId }: { agencyId: string }) {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [runs, setRuns] = useState<BillingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Agency>>({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/finanzen/kunden/${agencyId}`).then(r => r.json()),
      fetch(`/api/admin/billing?agency_id=${agencyId}`).then(r => r.json()),
    ]).then(([kundeData, billingData]) => {
      setAgency(kundeData);
      setForm(kundeData);
      setPlans(billingData.plans ?? []);
      setMandates(billingData.mandates ?? []);
      setRuns(billingData.runs ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agencyId]);

  const save = async () => {
    const res = await fetch(`/api/admin/finanzen/kunden/${agencyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const updated = await res.json();
      setAgency(updated);
      setEditing(false);
      toast.success('Gespeichert');
    } else {
      toast.error('Fehler beim Speichern');
    }
  };

  const generateCheckoutLink = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch(`/api/admin/finanzen/kunden/${agencyId}/checkout-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.checkout_url) {
        setCheckoutUrl(data.checkout_url);
        toast.success('Checkout-Link erstellt');
      } else {
        toast.error(data.error || 'Fehler');
      }
    } catch {
      toast.error('Fehler beim Erstellen');
    }
    setCheckoutLoading(false);
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link kopiert');
  };

  const approveRun = async (runId: string) => {
    const res = await fetch(`/api/admin/billing/run/${runId}/freigabe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'freigeben' }),
    });
    if (res.ok) {
      toast.success('Freigegeben — Einzug gestartet');
      setRuns(prev => prev.map(r => r.id === runId ? { ...r, freigabe_status: 'freigegeben', status: 'zahlung_angestossen' } : r));
    } else {
      toast.error('Fehler bei Freigabe');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!agency) return <p className="text-red-600 p-8">Kunde nicht gefunden</p>;

  const activePlan = plans.find(p => p.status === 'aktiv');
  const activeMandate = mandates.find(m => m.status === 'gueltig') ?? mandates[0];

  return (
    <div className="max-w-5xl">
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück
      </button>

      <PageHeader
        label="FINANZEN"
        title={agency.name}
        description={agency.contact_name}
        action={
          editing ? (
            <div className="flex gap-2">
              <Button onClick={() => setEditing(false)} className="bg-gray-100 text-gray-700 hover:bg-gray-200">Abbrechen</Button>
              <Button onClick={save}><Save className="w-4 h-4 mr-1" /> Speichern</Button>
            </div>
          ) : (
            <Button onClick={() => setEditing(true)} className="bg-gray-100 text-gray-700 hover:bg-gray-200">Bearbeiten</Button>
          )
        }
      />

      {/* Stammdaten */}
      <Card padding="md" className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Stammdaten
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Firma', key: 'name' },
            { label: 'Rechtsform', key: 'rechtsform' },
            { label: 'Ansprechpartner', key: 'contact_name' },
            { label: 'Telefon', key: 'phone' },
            { label: 'E-Mail', key: 'email' },
            { label: 'Rechnungsmail', key: 'rechnungsmail' },
            { label: 'Anschrift', key: 'anschrift' },
            { label: 'USt-ID', key: 'ust_id' },
            { label: 'Paket', key: 'paket' },
            { label: 'MRR', key: 'mrr' },
          ].map(({ label, key }) => (
            <div key={key}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              {editing ? (
                <Input
                  value={String(form[key] ?? '')}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                />
              ) : (
                <p className="text-sm font-medium text-gray-900">
                  {key === 'mrr' ? fmtEur(Number(agency[key] ?? 0)) : String(agency[key] || '–')}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Zahlungsplan */}
      <Card padding="md" className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Zahlungsplan
        </h3>
        {activePlan ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Typ</p>
              <Badge tone={activePlan.typ === 'setup' ? 'softAccent' : 'accent'}>{activePlan.typ === 'setup' ? 'Setup' : 'Retainer'}</Badge>
            </div>
            <div>
              <p className="text-xs text-gray-500">Betrag netto</p>
              <p className="text-lg font-bold text-gray-900">{fmtEur(activePlan.betrag_netto)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Rhythmus</p>
              <p className="text-sm text-gray-900">{activePlan.rhythmus === 'monatlich' ? 'Monatlich' : 'Einmalig'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Fälligkeitstag</p>
              <p className="text-sm text-gray-900">{activePlan.faelligkeitstag}. des Monats</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Start</p>
              <p className="text-sm text-gray-900">{fmtDate(activePlan.start_datum)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Ende</p>
              <p className="text-sm text-gray-900">{activePlan.ende_datum ? fmtDate(activePlan.ende_datum) : 'Unbefristet'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              {statusBadge(activePlan.status)}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Kein aktiver Zahlungsplan</p>
        )}
      </Card>

      {/* SEPA-Mandat */}
      <Card padding="md" className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4" /> SEPA-Mandat
        </h3>
        {activeMandate ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-gray-500">Status</p>
                {statusBadge(activeMandate.status)}
              </div>
              <div>
                <p className="text-xs text-gray-500">Provider</p>
                <p className="text-sm text-gray-900">{activeMandate.provider === 'stripe' ? 'Stripe' : 'Mollie'}</p>
              </div>
              {activeMandate.erteilt_am && (
                <div>
                  <p className="text-xs text-gray-500">Erteilt am</p>
                  <p className="text-sm text-gray-900">{fmtDate(activeMandate.erteilt_am)}</p>
                </div>
              )}
            </div>
            {activeMandate.status !== 'gueltig' && (
              <Button onClick={generateCheckoutLink} disabled={checkoutLoading} className="bg-red-600 text-white hover:bg-red-700">
                <ExternalLink className="w-4 h-4 mr-1" />
                {checkoutLoading ? 'Erstelle...' : 'Neuen Checkout-Link generieren'}
              </Button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-400 mb-3">Kein Mandat vorhanden</p>
            <Button onClick={generateCheckoutLink} disabled={checkoutLoading} className="bg-red-600 text-white hover:bg-red-700">
              <ExternalLink className="w-4 h-4 mr-1" />
              {checkoutLoading ? 'Erstelle...' : 'SEPA-Mandat anfordern'}
            </Button>
          </div>
        )}

        {/* Checkout Link */}
        {(checkoutUrl || activeMandate?.checkout_url) && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Zahlungslink (an Kunden senden)</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-700 bg-white px-2 py-1 rounded border flex-1 truncate">
                {checkoutUrl || activeMandate?.checkout_url}
              </code>
              <button
                onClick={() => copyLink(checkoutUrl || activeMandate?.checkout_url || '')}
                className="p-2 hover:bg-gray-200 rounded transition-colors"
              >
                <Copy className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Rechnungen */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Rechnungen</h3>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-400 px-6 py-8">Keine Rechnungen vorhanden</p>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="grid grid-cols-[100px_80px_100px_100px_120px_120px_100px] gap-3 px-6 py-3 bg-gray-50">
              <span className="text-xs font-bold text-gray-400 uppercase">Rechnung</span>
              <span className="text-xs font-bold text-gray-400 uppercase">Periode</span>
              <span className="text-xs font-bold text-gray-400 uppercase text-right">Netto</span>
              <span className="text-xs font-bold text-gray-400 uppercase text-right">Brutto</span>
              <span className="text-xs font-bold text-gray-400 uppercase">Status</span>
              <span className="text-xs font-bold text-gray-400 uppercase">Freigabe</span>
              <span className="text-xs font-bold text-gray-400 uppercase">Aktion</span>
            </div>
            {runs.map(run => (
              <div key={run.id} className="grid grid-cols-[100px_80px_100px_100px_120px_120px_100px] gap-3 items-center px-6 py-3 hover:bg-gray-50">
                <span className="text-sm font-medium text-gray-900">{run.lex_invoice_number || '–'}</span>
                <span className="text-sm text-gray-600">{run.periode}</span>
                <span className="text-sm text-gray-900 text-right tabular-nums">{fmtEur(run.betrag_netto)}</span>
                <span className="text-sm font-medium text-gray-900 text-right tabular-nums">{fmtEur(run.betrag_brutto)}</span>
                <div>{statusBadge(run.status)}</div>
                <div>{statusBadge(run.freigabe_status || 'ausstehend')}</div>
                <div>
                  {run.status === 'rechnung_erstellt' && run.freigabe_status !== 'freigegeben' && (
                    <button
                      onClick={() => approveRun(run.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700"
                    >
                      <Check className="w-3 h-3" /> Freigeben
                    </button>
                  )}
                  {run.status === 'bezahlt' && (
                    <span className="text-xs text-gray-400">{fmtDate(run.bezahlt_am)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
