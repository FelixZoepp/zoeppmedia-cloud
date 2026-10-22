'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { ReportZahlen } from '@/lib/sales/report';

interface Daten {
  zahlen: ReportZahlen;
  letzte: Array<{
    id: string;
    lead_id: string;
    name: string | null;
    report: string;
    eingetragen_am: string;
    whatsapp_status: string | null;
    geoeffnet_am: string | null;
    erster_anruf_am: string | null;
    gebucht_am: string | null;
  }>;
  reports: Array<{ key: string; titel: string; pdf: boolean }>;
  stand: { intern: boolean; whatsapp: boolean; vorlage: string };
}

const WA_STATUS: Record<string, string> = {
  gesendet: 'WhatsApp ✓',
  aus: 'WhatsApp aus',
  kein_pdf: 'kein PDF',
  vorlage_fehlt: 'Vorlage fehlt',
  keine_nummer: 'keine Nummer',
  abgemeldet: 'STOP',
};

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const minBis = (von: string, bis: string) => Math.max(0, Math.round((new Date(bis).getTime() - new Date(von).getTime()) / 60_000));

/** Report-Funnel (Freebie): getrennt vom normalen Funnel – Anruf-Tempo, Öffnungen, Buchungen, PDF hinterlegen */
export function ReportBereich({ zeitraum }: { zeitraum: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [funnel, setFunnel] = useState('Report');
  const [titel, setTitel] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/admin/vertrieb/reports?zeitraum=${zeitraum}`, { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, [zeitraum]);

  useEffect(() => {
    const t = setTimeout(() => void laden(), 0);
    return () => clearTimeout(t);
  }, [laden]);

  const speichern = async () => {
    setLaeuft(true);
    setMeldung(null);
    try {
      let pfad: string | undefined;
      if (datei) {
        if (datei.type !== 'application/pdf') throw new Error('Bitte eine PDF-Datei wählen');
        const r = await fetch('/api/admin/vertrieb/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ funnel }) });
        const link = await r.json();
        if (!r.ok) throw new Error(link.error ?? 'Upload nicht möglich');
        const { error } = await createClient().storage.from(link.bucket).uploadToSignedUrl(link.pfad, link.token, datei, { contentType: 'application/pdf' });
        if (error) throw new Error('Upload fehlgeschlagen');
        pfad = link.pfad;
      }
      const s = await fetch('/api/admin/vertrieb/reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ funnel, titel, pfad }) });
      const x = await s.json();
      if (!s.ok) throw new Error(x.error ?? 'Speichern fehlgeschlagen');
      setMeldung('Gespeichert.');
      setDatei(null);
      await laden();
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLaeuft(false);
    }
  };

  if (!d) return null;
  const z = d.zahlen;
  const kachel = (label: string, wert: string, unter?: string) => (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-[12.5px] text-gray-500">{label}</p>
      <p className="text-[22px] font-semibold leading-tight">{wert}</p>
      {unter && <p className="text-[12px] text-gray-500">{unter}</p>}
    </div>
  );
  const pct = (v: number | null) => (v === null ? '–' : `${v} %`);

  return (
    <Card>
      <h3 className="text-[17px] font-medium">Report-Funnel</h3>
      <p className="mt-1 text-[13px] text-gray-600">
        Downloads aus Perspective-Funnels mit „Report“ im Namen – getrennt vom normalen Funnel. Wie schnell wird angerufen, wer öffnet das PDF, wer bucht ein Erstgespräch?
      </p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-gray-600">
        <span>Slack + Aufgabe: {d.stand.intern ? '✅ an' : '⏸️ aus'}</span>
        <span>WhatsApp an Leads: {d.stand.whatsapp ? '✅ an' : '⏸️ aus (nur Testnummern)'}</span>
        <span>Vorlage report_versand: {d.stand.vorlage}</span>
        <a href="/admin/freigaben" className="text-red-800 hover:underline">
          Freigaben
        </a>
      </p>

      {z.downloads === 0 ? (
        <p className="mt-3 text-[14px] text-gray-500">Noch keine Downloads im Zeitraum.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {kachel('Downloads', String(z.downloads), `${z.whatsapp} per WhatsApp · ${pct(z.geoeffnetQuote)} geöffnet`)}
            {kachel('Angerufen in ≤ 5 Min.', pct(z.in5MinQuote), `${z.angerufen} von ${z.downloads} angerufen`)}
            {kachel('Ø bis zum Anruf', z.medianMinBisAnruf === null ? '–' : `${z.medianMinBisAnruf} Min.`, 'Median')}
            {kachel('Erstgespräch gebucht', pct(z.gebuchtQuote), `${z.gebucht} Leads · ${z.direkt} direkt (≤ 10 Min.)`)}
          </div>
          {z.reports.length > 1 && (
            <ul className="mt-3 space-y-1 text-[14px]">
              {z.reports.map((r) => (
                <li key={r.report} className="flex justify-between gap-2">
                  <span className="truncate">{r.report}</span>
                  <span className="text-gray-500">
                    {r.downloads} · {pct(r.gebuchtQuote)} gebucht
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">Letzte Downloads</p>
            <ul className="mt-1 space-y-1 text-[14px]">
              {d.letzte.map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-2">
                  <a href={`https://app.close.com/lead/${o.lead_id}/`} target="_blank" rel="noreferrer" className="truncate hover:text-red-700">
                    {o.name ?? 'Lead'}
                    <span className="text-gray-500"> · {zeit(o.eingetragen_am)}</span>
                  </a>
                  <span className="text-[13px] text-gray-500">
                    {o.erster_anruf_am ? `angerufen nach ${minBis(o.eingetragen_am, o.erster_anruf_am)} Min.` : 'nicht angerufen'}
                    {o.whatsapp_status ? ` · ${WA_STATUS[o.whatsapp_status] ?? o.whatsapp_status}` : ''}
                    {o.geoeffnet_am ? ' · PDF geöffnet' : ''}
                    {o.gebucht_am ? ' · ✅ gebucht' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-[14px] font-medium">PDF hinterlegen</p>
        {d.reports.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[13.5px] text-gray-700">
            {d.reports.map((r) => (
              <li key={r.key}>
                <span className="font-medium">{r.titel}</span> <span className="text-gray-500">(Funnel „{r.key}“{r.pdf ? ', PDF ✓' : ', kein PDF'})</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[12.5px] text-gray-500">
          Funnel = der Name hinter <code>&amp;funnel=</code> in der Webhook-URL. Titel steht so in der WhatsApp („hier ist dein Report „…““).
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1.5fr_1.5fr_auto]">
          <input value={funnel} onChange={(e) => setFunnel(e.target.value)} placeholder="Funnel, z. B. Report-300k" className="h-10 rounded-lg border border-gray-200 px-3 text-[14px]" />
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Titel des Reports" className="h-10 rounded-lg border border-gray-200 px-3 text-[14px]" />
          <input type="file" accept="application/pdf" onChange={(e) => setDatei(e.target.files?.[0] ?? null)} className="text-[13px]" />
          <Button variant="secondary" onClick={speichern} disabled={laeuft || !titel.trim()}>
            {laeuft ? 'Speichere …' : 'Speichern'}
          </Button>
        </div>
        {meldung && <p className="mt-1 text-[13px] text-gray-600">{meldung}</p>}
      </div>
    </Card>
  );
}
