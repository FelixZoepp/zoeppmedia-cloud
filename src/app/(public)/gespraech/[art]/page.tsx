import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'So läuft das Gespräch ab – Zoepp Media', robots: { index: false } };

const VIDEO_BASIS = 'https://qfzqoxeocyuqfreihiok.supabase.co/storage/v1/object/public/videos';

/** Videos „So läuft das Gespräch ab“ – Ziel der Short-Links aus den WhatsApp-Terminbestätigungen */
const GESPRAECHE: Record<string, { titel: string; text: string; datei: string }> = {
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
        <video
          className="mt-5 aspect-video w-full rounded-xl bg-black"
          src={`${VIDEO_BASIS}/${g.datei}`}
          controls
          playsInline
          preload="metadata"
        />
        <p className="mt-4 text-[13.5px] text-gray-500">Fragen vorab? Antworte einfach auf unsere WhatsApp-Nachricht.</p>
      </div>
    </main>
  );
}
