/**
 * Supabase liefert pro Abfrage höchstens max_rows (1000) Zeilen – .limit() darüber greift nicht.
 * Diese Helfer laden seitenweise bzw. teilen lange .in()-Listen auf, damit Zählungen nicht still abbrechen.
 */

type Antwort<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Alle Zeilen laden: `build(from, to)` muss die Abfrage mit `.range(from, to)` liefern (stabile Sortierung!). */
export async function fetchAll<T>(build: (from: number, to: number) => Antwort<T>, pageSize = 1000, max = 200_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** Lange ID-Listen für .in() in Blöcke teilen (URL-Länge bei PostgREST) und Ergebnisse zusammenführen. */
export async function inChunks<I, T>(ids: I[], fn: (chunk: I[]) => Promise<T[]>, size = 200): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

/** Wie inChunks, lädt aber je Block zusätzlich alle Seiten. */
export function fetchAllIn<I, T>(ids: I[], build: (chunk: I[], from: number, to: number) => Antwort<T>, size = 200): Promise<T[]> {
  return inChunks(ids, (chunk) => fetchAll((from, to) => build(chunk, from, to)), size);
}

/** Begrenzte Parallelität: höchstens `limit` Aufgaben gleichzeitig, Reihenfolge bleibt erhalten. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
