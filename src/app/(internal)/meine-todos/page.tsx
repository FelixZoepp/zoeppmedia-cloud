'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StepRow } from '@/components/fulfillment/step-row';
import type { StepView } from '@/lib/fulfillment/views';
import { today } from '@/lib/fulfillment/views-client';

type Gruppe = { key: string; label: string; filter: (s: StepView) => boolean };

const GRUPPEN: Gruppe[] = [
  { key: 'pruefen', label: 'Vom Kunden erledigt – bitte prüfen', filter: (s) => s.status === 'zur_pruefung' },
  { key: 'ueberfaellig', label: 'Überfällig', filter: (s) => s.status !== 'zur_pruefung' && s.ueberfaellig },
  { key: 'heute', label: 'Heute fällig', filter: (s) => s.status !== 'zur_pruefung' && !s.ueberfaellig && s.faellig_am === today() },
  { key: 'demnaechst', label: 'Demnächst', filter: (s) => s.status !== 'zur_pruefung' && !s.ueberfaellig && s.faellig_am !== today() },
];

interface MeineAd {
  id: string;
  agency_name: string;
  titel: string;
  typ: string;
  stage: string;
  faellig_am: string | null;
  kunden_kommentar: string | null;
}

interface WeitereAufgabe {
  quelle: 'projekt' | 'intern';
  id: string;
  titel: string;
  status: string;
  faellig_am: string | null;
  agency_name: string | null;
  link: string;
  zugewiesen: boolean;
}

const AD_STAGE_LABEL: Record<string, string> = {
  idee: 'Idee',
  material: 'Material',
  bearbeitung: 'Bearbeitung',
  bereit: 'Freigegeben – live schalten',
};

export default function MeineTodosPage() {
  const [steps, setSteps] = useState<StepView[] | null>(null);
  const [ads, setAds] = useState<MeineAd[]>([]);
  const [weitere, setWeitere] = useState<WeitereAufgabe[]>([]);
  const [buchhaltung, setBuchhaltung] = useState<{ rechnungen: number; mahnanrufe: number } | null>(null);

  const load = () =>
    fetch('/api/meine-todos')
      .then((r) => (r.ok ? r.json() : { schritte: [] }))
      .then((d) => {
        setSteps(d.schritte ?? []);
        setAds(d.ads ?? []);
        setBuchhaltung(d.buchhaltung ?? null);
        setWeitere(d.weitere ?? []);
      });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/meine-todos')
      .then((r) => (r.ok ? r.json() : { schritte: [] }))
      .then((d) => {
        if (cancelled) return;
        setSteps(d.schritte ?? []);
        setAds(d.ads ?? []);
        setBuchhaltung(d.buchhaltung ?? null);
        setWeitere(d.weitere ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/fulfillment/steps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) toast.error('Konnte nicht gespeichert werden');
    await load();
  };

  if (!steps) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader label="MEINE ARBEIT" title="Meine Aufgaben" counter={`${steps.length + ads.length + weitere.length} offen`}
        action={
          <Link href="/tasks" className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm font-semibold inline-flex items-center hover:bg-gray-50">
            + Interne Aufgabe
          </Link>
        }
      />
      {!steps.length && !ads.length && !weitere.length && (
        <Card padding="lg" className="text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Alles erledigt. Nichts liegt gerade bei dir.</p>
        </Card>
      )}
      <div className="space-y-4">
        {buchhaltung && (buchhaltung.rechnungen > 0 || buchhaltung.mahnanrufe > 0) && (
          <Link href="/buchhaltung">
            <Card padding="none" className="p-4 bg-yellow-50 border-yellow-200 hover:shadow-md">
              <p className="text-sm font-bold text-yellow-900">Buchhaltung</p>
              <p className="text-sm text-yellow-900 mt-0.5">
                {buchhaltung.rechnungen > 0 && <>{buchhaltung.rechnungen} Rechnung{buchhaltung.rechnungen === 1 ? '' : 'en'} schreiben</>}
                {buchhaltung.rechnungen > 0 && buchhaltung.mahnanrufe > 0 && ' · '}
                {buchhaltung.mahnanrufe > 0 && <>{buchhaltung.mahnanrufe} Mahnanruf{buchhaltung.mahnanrufe === 1 ? '' : 'e'}</>}
                {' →'}
              </p>
            </Card>
          </Link>
        )}
        {GRUPPEN.map((g) => {
          const list = steps.filter(g.filter);
          if (!list.length) return null;
          return (
            <Card key={g.key} padding="none" className="overflow-hidden">
              <div className={`px-4 py-2.5 text-sm font-bold ${g.key === 'ueberfaellig' ? 'bg-red-50 text-red-700' : g.key === 'pruefen' ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-800'}`}>
                {g.label} <span className="font-normal opacity-70">({list.length})</span>
              </div>
              <div className="px-4 divide-y divide-gray-100">
                {list.map((s) => (
                  <div key={s.id}>
                    <StepRow step={s} showAgency onChange={(p) => patch(s.id, p)} />
                    <Link href={`/clients/${s.agency_id}/ablauf`} className="block -mt-1 pb-2 text-[11px] text-gray-400 hover:text-red-600">
                      Ablauf von {s.agency_name} öffnen →
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}

        {weitere.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-2.5 text-sm font-bold bg-gray-50 text-gray-800">
              Weitere Aufgaben <span className="font-normal opacity-70">({weitere.length})</span>
            </div>
            <div className="px-4 divide-y divide-gray-100">
              {weitere.map((t) => (
                <div key={`${t.quelle}-${t.id}`} className="flex items-center gap-3 py-2.5">
                  <button
                    title="Erledigt"
                    onClick={async () => {
                      const res = await fetch(t.quelle === 'projekt' ? `/api/project-tasks/${t.id}` : `/api/tasks/${t.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: t.quelle === 'projekt' ? 'erledigt' : 'done' }),
                      });
                      if (!res.ok) {
                        toast.error((await res.json().catch(() => ({}))).error ?? 'Bitte in der Aufgabe abschließen');
                        return;
                      }
                      await load();
                    }}
                    className="w-5 h-5 rounded border-2 border-gray-300 hover:border-red-500 flex-shrink-0"
                  />
                  <Link href={t.link} className="flex-1 min-w-0 hover:text-red-600">
                    <p className="text-sm">
                      {t.agency_name && <span className="text-xs font-semibold text-red-600 mr-2">{t.agency_name}</span>}
                      <span className="text-gray-900">{t.titel}</span>
                    </p>
                  </Link>
                  {!t.zugewiesen && <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">ohne Zuständigen</span>}
                  {t.status === 'blockiert' && <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">blockiert</span>}
                  {t.faellig_am && <span className="text-xs text-gray-500">{new Date(`${t.faellig_am.slice(0, 10)}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {ads.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-2.5 text-sm font-bold bg-gray-50 text-gray-800">
              Meine Ads <span className="font-normal opacity-70">({ads.length})</span>
            </div>
            <div className="px-4 divide-y divide-gray-100">
              {ads.map((a) => (
                <Link key={a.id} href="/ads" className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-4 px-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="text-xs font-semibold text-red-600 mr-2">{a.agency_name}</span>
                      <span className="font-medium text-gray-900">{a.titel}</span>
                    </p>
                    {a.kunden_kommentar && a.stage === 'bearbeitung' && (
                      <p className="text-xs text-amber-700 mt-0.5">Änderungswunsch: {a.kunden_kommentar}</p>
                    )}
                  </div>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${a.stage === 'bereit' ? 'bg-green-50 text-green-700 font-semibold' : 'bg-gray-100 text-gray-600'}`}>
                    {AD_STAGE_LABEL[a.stage] ?? a.stage}
                  </span>
                  {a.faellig_am && <span className="text-xs text-gray-500">{new Date(`${a.faellig_am}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>}
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
