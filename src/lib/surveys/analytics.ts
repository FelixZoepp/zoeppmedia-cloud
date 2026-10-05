/** Zufriedenheit auswerten: Durchschnitte gesamt, je Kunde, je Betreuer, je Frage und als Verlauf. */

export interface SurveyRow {
  agency_id: string;
  rating: number | null;
  answers: Record<string, unknown> | null;
  created_at: string;
  template_id: string | null;
}

export interface SatisfactionStats {
  gesamt: { schnitt: number | null; anzahl: number };
  jeKunde: Array<{ agency_id: string; name: string; schnitt: number; anzahl: number; zuletzt: string; betreuer: string | null }>;
  jeBetreuer: Array<{ user_id: string | null; name: string; schnitt: number; anzahl: number; kunden: number }>;
  jeFrage: Array<{ id: string; label: string; schnitt: number; anzahl: number }>;
  verlauf: Array<{ monat: string; schnitt: number | null; anzahl: number }>;
  kritisch: Array<{ agency_id: string; name: string; schnitt: number }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const isScore = (v: unknown): v is number => typeof v === 'number' && v >= 1 && v <= 10;

/** Gesamtnote einer Antwort: rating, sonst Mittel der Einzelfragen */
export function scoreOf(r: SurveyRow): number | null {
  if (isScore(r.rating)) return r.rating;
  const vals = Object.values(r.answers ?? {}).filter(isScore);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function computeSatisfaction(
  rows: SurveyRow[],
  agencies: Map<string, { name: string; csm_user_id: string | null }>,
  users: Map<string, string>,
  questionLabels: Map<string, string>,
  now: Date = new Date(),
  schwelle = 3,
): SatisfactionStats {
  const scored = rows.map((r) => ({ r, s: scoreOf(r) })).filter((x): x is { r: SurveyRow; s: number } => x.s !== null);

  const kunden = new Map<string, { scores: number[]; zuletzt: string }>();
  for (const { r, s } of scored) {
    const k = kunden.get(r.agency_id) ?? { scores: [], zuletzt: r.created_at };
    k.scores.push(s);
    if (r.created_at > k.zuletzt) k.zuletzt = r.created_at;
    kunden.set(r.agency_id, k);
  }
  const jeKunde = [...kunden.entries()]
    .map(([id, k]) => {
      const a = agencies.get(id);
      return {
        agency_id: id,
        name: a?.name ?? 'Unbekannt',
        schnitt: avg(k.scores)!,
        anzahl: k.scores.length,
        zuletzt: k.zuletzt,
        betreuer: a?.csm_user_id ? users.get(a.csm_user_id) ?? null : null,
      };
    })
    .sort((x, y) => x.schnitt - y.schnitt || x.name.localeCompare(y.name, 'de'));

  // Je Betreuer (agencies.csm_user_id): Schnitt über alle Antworten seiner Kunden
  const betreuer = new Map<string, { scores: number[]; kunden: Set<string> }>();
  for (const { r, s } of scored) {
    const key = agencies.get(r.agency_id)?.csm_user_id ?? '–';
    const b = betreuer.get(key) ?? { scores: [], kunden: new Set<string>() };
    b.scores.push(s);
    b.kunden.add(r.agency_id);
    betreuer.set(key, b);
  }
  const jeBetreuer = [...betreuer.entries()]
    .map(([id, b]) => ({
      user_id: id === '–' ? null : id,
      name: id === '–' ? 'Ohne Betreuer' : users.get(id) ?? 'Unbekannt',
      schnitt: avg(b.scores)!,
      anzahl: b.scores.length,
      kunden: b.kunden.size,
    }))
    .sort((x, y) => y.schnitt - x.schnitt);

  const fragen = new Map<string, number[]>();
  for (const r of rows) {
    for (const [id, v] of Object.entries(r.answers ?? {})) {
      if (isScore(v)) fragen.set(id, [...(fragen.get(id) ?? []), v]);
    }
  }
  const jeFrage = [...fragen.entries()]
    .map(([id, xs]) => ({ id, label: questionLabels.get(id) ?? id, schnitt: avg(xs)!, anzahl: xs.length }))
    .sort((x, y) => x.schnitt - y.schnitt);

  const verlauf = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1));
    const monat = d.toISOString().slice(0, 7);
    const xs = scored.filter(({ r }) => r.created_at.startsWith(monat)).map(({ s }) => s);
    return { monat, schnitt: avg(xs), anzahl: xs.length };
  });

  return {
    gesamt: { schnitt: avg(scored.map((x) => x.s)), anzahl: scored.length },
    jeKunde,
    jeBetreuer,
    jeFrage,
    verlauf,
    kritisch: jeKunde.filter((k) => k.schnitt < schwelle).map(({ agency_id, name, schnitt }) => ({ agency_id, name, schnitt })),
  };
}
