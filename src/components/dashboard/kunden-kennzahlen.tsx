'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { StatCard } from '@/components/ui';

export interface KundenKennzahlenDaten {
  vorstellungsgespraeche: number;
  naechstesGespraech: string | null;
  probetage: number;
  naechsterProbetag: string | null;
  einstellungen30: number;
  einstellungenGesamt: number;
  letzterMonat: string;
  umsatzLetzterMonat: number | null;
  wachstumProzent: number | null;
  roiLetzterMonat: number | null;
  roiKumuliert: number | null;
  umsatzVerlauf: number[];
  fehlend: Array<{ id: string; name: string }>;
}

const TZ = 'Europe/Berlin';
const monatName = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: TZ });
const naechster = (iso: string | null) =>
  iso ? `nächster: ${new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ })}, ${new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ })} Uhr` : 'keiner geplant';

/** Auf einen Blick: geplante Gespräche und Probetage, Einstellungen, Umsatz der Neuen und ROI – plus Pflicht-Hinweis */
export function KundenKennzahlen({ d }: { d: KundenKennzahlenDaten }) {
  const roi = d.roiLetzterMonat ?? d.roiKumuliert;
  return (
    <div className="space-y-4">
      {d.fehlend.length > 0 && (
        <Link
          href="/umsaetze"
          className="fx-rise flex flex-col gap-3 rounded-xl bg-gradient-to-b from-amber-50 to-amber-100/70 px-5 py-4 text-amber-950 shadow-[inset_0_0_0_1.5px_#f3c26b] transition-colors hover:to-amber-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-700" />
            <span>
              <span className="block text-[15px] font-semibold">Bitte trag die Umsätze deiner neuen Vertriebler für {monatName(d.letzterMonat)} ein</span>
              <span className="mt-0.5 block text-[13.5px] text-amber-900">
                Nur so sehen wir gemeinsam, was die Kampagne bringt. Offen: {d.fehlend.slice(0, 4).map((f) => f.name).join(', ')}
                {d.fehlend.length > 4 ? ` und ${d.fehlend.length - 4} weitere` : ''}.
              </span>
            </span>
          </span>
          <span className="inline-flex flex-none items-center gap-1.5 self-start rounded-full bg-amber-700 px-4 py-2 text-[14px] font-semibold text-white sm:self-center">
            Jetzt eintragen <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard hero title="Vorstellungsgespräche geplant" value={d.vorstellungsgespraeche} note={naechster(d.naechstesGespraech)} href="/termine" />
        <StatCard title="Probetage geplant" value={d.probetage} note={naechster(d.naechsterProbetag)} href="/termine" />
        <StatCard title="Einstellungen" value={d.einstellungen30} note={`in 30 Tagen · ${d.einstellungenGesamt} gesamt`} href="/candidates" />
        <StatCard
          title={`Umsatz der Neuen (${new Date(`${d.letzterMonat}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'short', timeZone: TZ })})`}
          value={d.umsatzLetzterMonat ?? '–'}
          suffix={d.umsatzLetzterMonat !== null ? ' €' : ''}
          trend={d.wachstumProzent ?? undefined}
          trendLabel="ggü. Vormonat"
          note={d.umsatzLetzterMonat === null ? 'noch nicht eingetragen' : undefined}
          spark={d.umsatzVerlauf.some((x) => x > 0) ? d.umsatzVerlauf : undefined}
          href="/umsaetze"
        />
        <StatCard
          title="ROI"
          value={roi === null ? '–' : `${roi.toLocaleString('de-DE', { maximumFractionDigits: 1 })}×`}
          note={roi === null ? 'nach den ersten Umsätzen' : d.roiLetzterMonat !== null ? `letzter Monat · seit Start ${d.roiKumuliert?.toLocaleString('de-DE', { maximumFractionDigits: 1 }) ?? '–'}×` : 'seit Start'}
          href="/umsaetze"
          className="sm:col-span-2 lg:col-span-1"
        />
      </div>
    </div>
  );
}
