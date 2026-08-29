'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Search, Users, Plus, TrendingUp } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Customer {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  paket: string | null;
  mrr: number;
  rechtsform: string | null;
  mandate_status: string | null;
  open_invoices: number;
  plan_count: number;
  created_at: string;
}

interface KundenData {
  customers: Customer[];
  total_mrr: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatEuro(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);
}

type MandateBadgeTone = 'softAccent' | 'success' | 'accent' | 'neutral';

function mandateBadgeTone(status: string | null): MandateBadgeTone {
  if (status === 'gueltig') return 'success';
  if (status === 'angefragt') return 'softAccent';
  if (status === 'widerrufen') return 'accent';
  return 'neutral';
}

function mandateLabel(status: string | null): string {
  if (status === 'gueltig') return 'Gueltig';
  if (status === 'angefragt') return 'Angefragt';
  if (status === 'widerrufen') return 'Widerrufen';
  if (!status) return 'Kein Mandat';
  return status;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function KundenClient() {
  const router = useRouter();
  const [data, setData] = useState<KundenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/finanzen/kunden');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('Fehler beim Laden der Kundendaten');
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
          title="Kunden"
          description="Alle Kunden mit Abrechnungsdaten"
        />
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const filtered = data.customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.contact_name?.toLowerCase().includes(q) ?? false) ||
      (c.email?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="FINANZEN"
        title="Kunden"
        description="Alle Kunden mit Abrechnungsdaten"
        counter={`${data.customers.length} Kunden`}
        action={
          <Button size="sm" variant="primary" onClick={() => router.push('/admin/after-close')}>
            <Plus className="w-3.5 h-3.5" />
            Kunden anlegen
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card padding="md">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-2.5 rounded-xl bg-blue-50">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Kunden gesamt</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.customers.length}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-2.5 rounded-xl bg-green-50">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Gesamt MRR</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatEuro(data.total_mrr)}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-2.5 rounded-xl bg-amber-50">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Offene Rechnungen</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.customers.reduce((sum, c) => sum + c.open_invoices, 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          icon={<Search className="w-4 h-4" />}
          placeholder="Kunde suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">Keine Kunden gefunden.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kunde</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ansprechpartner</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">E-Mail</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Paket</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">MRR</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mandat</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Offene Rechnungen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/admin/finanzen/kunden/${c.id}`)}
                  >
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600">
                      {c.contact_name || '--'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600">
                      {c.email || '--'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {c.paket ? (
                        <Badge tone="outline">{c.paket}</Badge>
                      ) : (
                        <span className="text-sm text-gray-400">--</span>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {c.mrr > 0 ? formatEuro(c.mrr) : '--'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Badge tone={mandateBadgeTone(c.mandate_status)}>
                        {mandateLabel(c.mandate_status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-right">
                      {c.open_invoices > 0 ? (
                        <Badge tone="softAccent">{c.open_invoices}</Badge>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
