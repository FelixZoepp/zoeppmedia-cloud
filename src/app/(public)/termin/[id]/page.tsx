import type { Metadata } from 'next';
import { CalendarPlus, Clock, MapPin } from 'lucide-react';
import { googleLink, outlookLink, terminText } from '@/lib/sales/termin-kalender';
import { ladeSalesTermin } from '@/lib/sales/termin-laden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Termin in den Kalender – Zoepp Media', robots: { index: false } };

const TZ = 'Europe/Berlin';

/** Öffentliche Seite hinter dem Button „Zum Kalender hinzufügen“ aus der WhatsApp-Terminbestätigung */
export default async function TerminSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await ladeSalesTermin(id);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-[0_30px_80px_-40px_#1a151466] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-gradient-to-b from-red-700 to-red-950 text-lg font-bold text-white">Z</span>
          <p className="text-[15px] font-semibold tracking-[-0.02em]">Zoepp Media</p>
        </div>

        {!t ? (
          <div className="mt-6">
            <h1 className="text-[24px] font-semibold tracking-[-0.03em]">Termin nicht gefunden</h1>
            <p className="mt-2 text-[15px] text-gray-600">Der Link ist ungültig oder der Termin wurde geändert. Schreib uns einfach kurz per WhatsApp.</p>
          </div>
        ) : t.abgesagt ? (
          <div className="mt-6">
            <h1 className="text-[24px] font-semibold tracking-[-0.03em]">Dieser Termin wurde abgesagt</h1>
            <p className="mt-2 text-[15px] text-gray-600">Schreib uns kurz per WhatsApp, dann finden wir einen neuen Termin.</p>
          </div>
        ) : (
          <TerminInhalt t={t} />
        )}
      </div>
    </main>
  );
}

function TerminInhalt({ t }: { t: NonNullable<Awaited<ReturnType<typeof ladeSalesTermin>>> }) {
  const x = terminText(t.art);
  const tag = new Date(t.start).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', timeZone: TZ });
  const von = new Date(t.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const bis = new Date(t.ende).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const knopf = 'flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium transition-transform hover:-translate-y-0.5';
  return (
    <div className="mt-6">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">{t.vorname ? `${t.vorname}, ` : ''}dein Termin</h1>
      <p className="mt-1 text-[15px] text-gray-600">{x.titel}</p>

      <div className="mt-5 space-y-2.5 rounded-[16px] bg-panel p-4 text-[15px]">
        <p className="flex items-start gap-2.5">
          <Clock className="mt-0.5 h-4 w-4 flex-none text-red-800" />
          <span>
            <strong className="font-semibold">{tag}</strong>
            <br />
            {von} – {bis} Uhr
          </span>
        </p>
        <p className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 h-4 w-4 flex-none text-red-800" />
          <span>{x.ort}</span>
        </p>
      </div>

      <p className="mt-6 flex items-center gap-2 text-[14px] font-medium text-gray-700">
        <CalendarPlus className="h-4 w-4" /> In deinen Kalender eintragen
      </p>
      <div className="mt-3 space-y-2.5">
        <a href={googleLink(t)} target="_blank" rel="noopener noreferrer" className={`${knopf} bg-gradient-to-b from-red-700 to-red-950 text-red-50 shadow-hero`}>
          Google Kalender
        </a>
        <a href={`/api/termin/${t.id}/ics`} className={`${knopf} bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--hair)]`}>
          iPhone / Apple Kalender
        </a>
        <a href={outlookLink(t)} target="_blank" rel="noopener noreferrer" className={`${knopf} bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--hair)]`}>
          Outlook
        </a>
      </div>
      <p className="mt-5 text-center text-[12.5px] text-gray-500">Mit einer Erinnerung 15 Minuten vorher.</p>
    </div>
  );
}
