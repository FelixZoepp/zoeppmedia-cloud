import type { KostenZeile, MetaStatus } from '@/lib/kosten/stellen';

export const eur = (n: number | null | undefined) =>
  n == null ? '–' : `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const META_TEXT: Record<MetaStatus, string | null> = {
  ok: null,
  kein_werbekonto: 'Kein Meta-Werbekonto hinterlegt',
  nicht_verbunden: 'Meta nicht verbunden',
  kein_zugriff: 'Kein Zugriff auf Werbekonto',
  tabelle_fehlt: 'Datenbank-Änderung fehlt noch',
};

/** Kosten, Bewerber je Quelle und Kosten pro Bewerber / Termin / Einstellung */
export function KostenKacheln({ z }: { z: KostenZeile }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Kachel label="Meta-Kosten" wert={eur(z.metaKosten)} sub={`${z.bewerberQuelle.meta} Meta-Bewerber · ${eur(z.metaKostenProBewerber)} / Bewerber`} />
      <Kachel label="Indeed-Kosten" wert={eur(z.indeedKosten)} sub={`${z.bewerberQuelle.indeed} Indeed-Bewerber · ${eur(z.indeedKostenProBewerber)} / Bewerber`} />
      <Kachel label="Bewerber" wert={String(z.bewerber)} sub={z.bewerberQuelle.sonstige ? `davon ${z.bewerberQuelle.sonstige} aus anderen Quellen` : undefined} />
      <Kachel hero label="Kosten pro Bewerber" wert={eur(z.kostenProBewerber)} sub={`Gesamt ${eur(z.kosten)}`} />
      <Kachel label="Kosten pro Termin" wert={eur(z.kostenProTermin)} sub={`${z.termine} Termine`} />
      <Kachel label="Kosten pro Einstellung" wert={eur(z.kostenProEinstellung)} sub={`${z.einstellungen} Einstellungen`} />
    </div>
  );
}

function Kachel({ label, wert, sub, hero = false }: { label: string; wert: string; sub?: string; hero?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${hero ? 'bg-blue-50' : 'bg-gray-50'}`}>
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="text-base font-bold text-gray-900">{wert}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}
