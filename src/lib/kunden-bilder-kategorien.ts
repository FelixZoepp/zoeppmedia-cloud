/** Bild-Kategorien fürs Fulfillment (auch im Browser nutzbar). Fotos vom Kunden selbst sind am wichtigsten. */

export type BildKategorie = 'ich' | 'team' | 'arbeit' | 'logo';

export const KATEGORIEN: Record<BildKategorie, { titel: string; hinweis: string }> = {
  ich: { titel: 'Fotos von dir', hinweis: 'Am wichtigsten: 3–5 Fotos von dir – gern lächelnd, im Job oder vor dem Firmenschild. Handyfotos reichen, Hauptsache hell und scharf.' },
  team: { titel: 'Team', hinweis: 'Gruppenfoto oder einzelne Leute aus dem Team.' },
  arbeit: { titel: 'Arbeitsalltag', hinweis: 'Büro, Fahrzeuge, Einsätze beim Kunden, Events.' },
  logo: { titel: 'Logo', hinweis: 'Möglichst als PNG mit transparentem Hintergrund.' },
};

export const istKategorie = (k: unknown): k is BildKategorie => typeof k === 'string' && k in KATEGORIEN;
