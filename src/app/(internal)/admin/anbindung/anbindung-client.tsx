'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Card, PageHeader, SegmentedControl, StatCard } from '@/components/ui';
import type { KanalStatus, KundeAnbindung } from '@/lib/anbindung/status';

const STATUS: Record<KanalStatus, { label: string; cls: string }> = {
  aktiv: { label: 'Läuft', cls: 'bg-green-50 text-green-800' },
  eingerichtet: { label: 'Eingerichtet', cls: 'bg-amber-50 text-amber-800' },
  fehlt: { label: 'Fehlt', cls: 'bg-red-50 text-red-800' },
};

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : null);

function Pill({ s, sub }: { s: KanalStatus; sub?: string | null }) {
  return (
    <div>
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS[s].cls}`}>{STATUS[s].label}</span>
      {sub && <p className="mt-0.5 text-[11.5px] text-gray-500">{sub}</p>}
    </div>
  );
}

function kopieren(text: string, was: string) {
  void navigator.clipboard.writeText(text);
  toast.success(`${was} kopiert`);
}

export function AnbindungClient() {
  const [d, setD] = useState<{ kunden: KundeAnbindung[]; metaSync: boolean; perspectiveWebhook: string } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState('offen');

  useEffect(() => {
    fetch('/api/admin/anbindung', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Fehler');
        setD(j);
      })
      .catch((e) => setFehler(e instanceof Error ? e.message : 'Fehler'));
  }, []);

  const kunden = d?.kunden ?? [];
  const liste = kunden.filter((k) => filter === 'alle' || k.offen.length > 0);
  const zähle = (f: (k: KundeAnbindung) => boolean) => kunden.filter(f).length;

  return (
    <div>
      <PageHeader
        label="RECRUITING-CLOUD"
        title="Bewerber-Anbindung"
        description="Kommen bei jedem Kunden Bewerber aus Meta/Funnel und Indeed an – und ist das Werbekonto für die Zahlen hinterlegt?"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hero title="Bewerber kommen an" value={zähle((k) => k.bewerber14 > 0)} note={`von ${kunden.length} Kunden (14 Tage)`} />
        <StatCard title="Meta / Funnel läuft" value={zähle((k) => k.meta.status === 'aktiv')} note={`${zähle((k) => k.meta.status === 'fehlt')} ohne Anbindung`} />
        <StatCard title="Indeed läuft" value={zähle((k) => k.indeed.status === 'aktiv')} note={`${zähle((k) => k.indeed.status === 'fehlt')} ohne Weiterleitung`} />
        <StatCard title="Werbekonto hinterlegt" value={zähle((k) => k.werbekonto.status !== 'fehlt')} note={d && !d.metaSync ? 'Meta-Abgleich nicht eingerichtet' : 'für Kosten & Ergebnisse'} />
      </div>

      {d && !d.metaSync && (
        <Card className="mb-4 flex items-start gap-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[14px]">
            Für Meta-Zahlen je Kunde fehlt in Vercel <code className="rounded bg-amber-50 px-1">META_SYSTEM_USER_TOKEN</code> – ein Systemnutzer-Token aus eurem
            Business Manager mit Zugriff auf die Werbekonten der Kunden (Recht <em>ads_read</em>).
          </p>
        </Card>
      )}

      <div className="mb-4">
        <SegmentedControl
          items={[
            { value: 'offen', label: `Mit offenen Punkten (${zähle((k) => k.offen.length > 0)})` },
            { value: 'alle', label: `Alle (${kunden.length})` },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {fehler && <Card className="mb-4 text-red-800">{fehler}</Card>}

      {!d ? (
        !fehler && (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        )
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[14px]">
              <thead className="bg-panel">
                <tr className="text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                  <th className="px-4 py-3">Kunde</th>
                  <th className="px-3 py-3">Meta / Funnel</th>
                  <th className="px-3 py-3">Indeed</th>
                  <th className="px-3 py-3">Werbekonto</th>
                  <th className="px-3 py-3">WhatsApp</th>
                  <th className="px-3 py-3 text-right">Bewerber 14 T.</th>
                  <th className="px-3 py-3">Offen</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {liste.map((k) => (
                  <tr key={k.id} className="border-t border-hair align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={k.name} src={k.logo_url} size={34} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{k.name}</p>
                          <p className="text-[12px] text-gray-500">{k.pausiert ? 'Pausiert' : k.jobsAktiv ? `${k.jobsAktiv} aktive Stelle${k.jobsAktiv === 1 ? '' : 'n'}` : 'keine aktive Stelle'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Pill s={k.meta.status} sub={k.meta.letzter ? `zuletzt ${datum(k.meta.letzter)} · ${k.meta.anzahl14} in 14 T.` : k.meta.funnel ? 'Funnel verknüpft' : null} />
                      <button
                        type="button"
                        onClick={() => kopieren(`${d.perspectiveWebhook}${d.perspectiveWebhook.includes('?') ? '&' : '?'}agency=${k.id}`, 'Perspective-Webhook')}
                        className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-red-800 hover:underline"
                      >
                        <Copy className="h-3 w-3" /> Webhook kopieren
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <Pill s={k.indeed.status} sub={k.indeed.letzter ? `zuletzt ${datum(k.indeed.letzter)} · ${k.indeed.anzahl14} in 14 T.` : null} />
                      <button
                        type="button"
                        onClick={() => kopieren(`bewerber+${k.id}@zoepp-gruppe.de`, 'Indeed-Adresse')}
                        className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-red-800 hover:underline"
                      >
                        <Copy className="h-3 w-3" /> Adresse kopieren
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <Pill s={k.werbekonto.status} sub={k.werbekonto.id ? `${k.werbekonto.id}${k.werbekonto.letzterReport ? ` · Daten bis ${datum(k.werbekonto.letzterReport)}` : ''}` : null} />
                    </td>
                    <td className="px-3 py-3">
                      <Pill s={k.whatsapp} />
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold ${k.bewerber14 ? '' : 'text-red-700'}`}>{k.bewerber14}</td>
                    <td className="px-3 py-3">
                      {k.offen.length === 0 ? (
                        <span className="text-[12.5px] text-green-700">Alles angebunden</span>
                      ) : (
                        <ul className="space-y-0.5 text-[12.5px] text-gray-700">
                          {k.offen.map((o) => (
                            <li key={o}>• {o}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/clients/${k.id}/integrationen`} className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-red-800 hover:underline">
                        Einrichten <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {liste.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                      Alle Kunden sind vollständig angebunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
