import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VIDEO_BASIS } from '@/lib/sales/ablauf-videos';
import { BOOKING_URLS } from '@/lib/sales/tracking';

export const metadata: Metadata = { title: 'Zoepp Media', robots: { index: false } };

/** Videos „So läuft das Gespräch ab“ – Ziel der Short-Links aus den WhatsApp-Terminbestätigungen */
const GESPRAECHE: Record<string, { titel: string; text: string; datei?: string; youtube?: string }> = {
  erstgespraech: {
    titel: 'So läuft dein Erstgespräch ab',
    text: 'In knapp 2 Minuten: was dich im Gespräch erwartet und wie du dich am besten vorbereitest.',
    datei: 'erstgespraech.mp4',
  },
  strategiegespraech: {
    titel: 'So läuft dein Strategiegespräch ab',
    text: 'In gut 3 Minuten: wie das Gespräch abläuft und wie du dich am besten vorbereitest.',
    datei: 'strategiegespraech.mp4',
  },
  // Fallstudie aus der WhatsApp-Kette „Eingetragen, aber kein Termin“ (Nachricht 2)
  'fallstudie-bc': {
    titel: 'B&C Direct Sales: von 2 auf 14 Leute in 90 Tagen',
    text: 'Damian erzählt in 40 Sekunden, wie B&C mit uns von 15.000 € auf 130.000 € Monatsumsatz gewachsen ist.',
    datei: 'fallstudie-bc.mp4',
  },
  // Fallstudie aus der WhatsApp nach No-Show im Beratungsgespräch (noshow_closing_rueckfrage)
  'fallstudie-david': {
    titel: 'SalesWinner Direktvertrieb: von 2 auf 24 Vertriebler',
    text: 'David Hamid erzählt, wie er mit uns sein Vertriebsteam aufgebaut hat.',
    youtube: 'qLZK2CCDRao',
  },
};
// Short-Link „beratungsgespraech“ zeigt auf dasselbe Video
GESPRAECHE.beratungsgespraech = GESPRAECHE.strategiegespraech;

export default async function GespraechSeite({ params }: { params: Promise<{ art: string }> }) {
  const { art } = await params;
  const g = GESPRAECHE[art];
  if (!g) notFound();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card p-5 shadow-[0_30px_80px_-40px_#1a151466] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-gradient-to-b from-red-700 to-red-950 text-lg font-bold text-white">Z</span>
          <p className="text-[15px] font-semibold tracking-[-0.02em]">Zoepp Media</p>
        </div>
        <h1 className="mt-6 text-[clamp(22px,4vw,28px)] font-semibold leading-tight tracking-[-0.03em]">{g.titel}</h1>
        <p className="mt-2 text-[15px] text-gray-600">{g.text}</p>
        {g.youtube ? (
          <iframe
            className="mt-5 aspect-video w-full rounded-xl bg-black"
            src={`https://www.youtube-nocookie.com/embed/${g.youtube}?rel=0`}
            title={g.titel}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <video
            className="mt-5 aspect-video w-full rounded-xl bg-black"
            src={`${VIDEO_BASIS}/${g.datei}`}
            controls
            playsInline
            preload="metadata"
          />
        )}
        {art.startsWith('fallstudie-') ? (
          <a
            href={BOOKING_URLS.setting}
            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-b from-red-700 to-red-950 px-6 text-[15px] font-medium text-white sm:w-auto"
          >
            Jetzt Erstgespräch buchen
          </a>
        ) : (
          <p className="mt-4 text-[13.5px] text-gray-500">Fragen vorab? Antworte einfach auf unsere WhatsApp-Nachricht.</p>
        )}
      </div>
    </main>
  );
}
