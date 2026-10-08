import { AMPEL_LABEL, type GarantieAmpel } from '@/lib/garantie/ampel';

const FARBE: Record<GarantieAmpel, { balken: string; text: string }> = {
  offen: { balken: 'bg-gray-300', text: 'text-gray-600' },
  anlauf: { balken: 'bg-gray-400', text: 'text-gray-600' },
  gruen: { balken: 'bg-green-600', text: 'text-green-700' },
  gelb: { balken: 'bg-amber-500', text: 'text-amber-700' },
  rot: { balken: 'bg-red-700', text: 'text-red-700' },
  erreicht: { balken: 'bg-green-600', text: 'text-green-700' },
};

/** Fortschrittsbalken „X von Y Startern eingestellt“ mit Ampel */
export function GarantieBalken({
  ampel,
  ist,
  ziel,
  kompakt = false,
}: {
  ampel: string;
  ist: number;
  ziel: number;
  kompakt?: boolean;
}) {
  const a = (ampel in FARBE ? ampel : 'offen') as GarantieAmpel;
  const anteil = ziel > 0 ? Math.min(100, Math.round((ist / ziel) * 100)) : 0;
  return (
    <div>
      <div className={`flex items-baseline justify-between gap-2 ${kompakt ? 'text-[12.5px]' : 'text-[14px]'}`}>
        <span className="text-gray-600">
          Garantie: <span className="font-medium text-ink">{ist} von {ziel}</span> Startern eingestellt
        </span>
        <span className={`font-medium ${FARBE[a].text}`}>{AMPEL_LABEL[a]}</span>
      </div>
      <div
        className={`mt-1.5 w-full overflow-hidden rounded-full bg-panel ${kompakt ? 'h-1.5' : 'h-2.5'}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ziel}
        aria-valuenow={ist}
        aria-label="Fortschritt Garantieziel"
      >
        <div className={`h-full rounded-full ${FARBE[a].balken}`} style={{ width: `${anteil}%` }} />
      </div>
    </div>
  );
}
