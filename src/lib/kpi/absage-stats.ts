import { ABSAGE_GRUENDE, ABSAGE_OHNE_GRUND, absageGrund, absageLabel, gruppeLabel } from '@/lib/recruiting/absagegruende';

export interface AbsageZeile {
  id: string;
  name: string | null;
  absage_code: string | null;
  absage_notiz: string | null;
  absage_phase_id: string | null;
  abgesagt_am: string;
}

export interface AbsageStats {
  gesamt: number;
  proGrund: Array<{ code: string; label: string; gruppe: string; anzahl: number; anteil: number }>;
  proGruppe: Array<{ key: string; label: string; anzahl: number; anteil: number }>;
  proPhase: Array<{ phase: string; anzahl: number; anteil: number }>;
  /** je Kalenderwoche (Montag, YYYY-MM-DD), Top-Gruppen gestapelt */
  proWoche: Array<{ woche: string; anzahl: number; gruppen: Record<string, number> }>;
  letzte: Array<{ id: string; name: string | null; grund: string; notiz: string | null; phase: string | null; am: string }>;
  /** Altbestand ohne Grund (vor Einführung des Katalogs) */
  ohneGrund: number;
}

const anteil = (n: number, g: number) => (g ? n / g : 0);

/** Montag der Woche (Berliner Zeit genügt hier auf Tagesebene) */
function wochenStart(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const tag = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - tag);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function berechneAbsageStats(zeilen: AbsageZeile[], phasen: Map<string, string>): AbsageStats {
  const gesamt = zeilen.length;
  const code = (z: AbsageZeile) => z.absage_code ?? ABSAGE_OHNE_GRUND.code;
  const gruppe = (z: AbsageZeile) => absageGrund(z.absage_code)?.gruppe ?? 'sonstiges';

  const zaehle = <K extends string>(f: (z: AbsageZeile) => K) => {
    const m = new Map<K, number>();
    for (const z of zeilen) m.set(f(z), (m.get(f(z)) ?? 0) + 1);
    return m;
  };

  const reihenfolge = new Map(ABSAGE_GRUENDE.map((g, i) => [g.code, i]));
  const proGrund = [...zaehle(code)]
    .map(([c, anzahl]) => ({ code: c, label: absageLabel(c), gruppe: absageGrund(c)?.gruppe ?? 'sonstiges', anzahl, anteil: anteil(anzahl, gesamt) }))
    .sort((a, b) => b.anzahl - a.anzahl || (reihenfolge.get(a.code) ?? 99) - (reihenfolge.get(b.code) ?? 99));

  const proGruppe = [...zaehle(gruppe)]
    .map(([key, anzahl]) => ({ key, label: gruppeLabel(key), anzahl, anteil: anteil(anzahl, gesamt) }))
    .sort((a, b) => b.anzahl - a.anzahl);

  const proPhase = [...zaehle((z) => (z.absage_phase_id && phasen.get(z.absage_phase_id)) || 'Unbekannt')]
    .map(([phase, anzahl]) => ({ phase, anzahl, anteil: anteil(anzahl, gesamt) }))
    .sort((a, b) => b.anzahl - a.anzahl);

  const wochen = new Map<string, { anzahl: number; gruppen: Record<string, number> }>();
  for (const z of zeilen) {
    const w = wochenStart(z.abgesagt_am);
    const e = wochen.get(w) ?? { anzahl: 0, gruppen: {} };
    e.anzahl++;
    e.gruppen[gruppe(z)] = (e.gruppen[gruppe(z)] ?? 0) + 1;
    wochen.set(w, e);
  }
  const proWoche = [...wochen].map(([woche, e]) => ({ woche, ...e })).sort((a, b) => a.woche.localeCompare(b.woche));

  const letzte = [...zeilen]
    .sort((a, b) => b.abgesagt_am.localeCompare(a.abgesagt_am))
    .slice(0, 15)
    .map((z) => ({
      id: z.id,
      name: z.name,
      grund: absageLabel(code(z)),
      notiz: z.absage_notiz,
      phase: (z.absage_phase_id && phasen.get(z.absage_phase_id)) || null,
      am: z.abgesagt_am,
    }));

  return { gesamt, proGrund, proGruppe, proPhase, proWoche, letzte, ohneGrund: zeilen.filter((z) => !z.absage_code || z.absage_code === ABSAGE_OHNE_GRUND.code).length };
}
