/** Fireflies-GraphQL-API: Transkripte laden (FIREFLIES_API_KEY in Vercel). */

const API = 'https://api.fireflies.ai/graphql';

export interface FfSatz {
  speaker_name: string | null;
  text: string;
  start_time: number;
}

export interface FfTranskript {
  id: string;
  title: string | null;
  date: number | string | null;
  duration: number | null;
  transcript_url: string | null;
  organizer_email: string | null;
  meeting_attendees: Array<{ email: string | null; displayName: string | null; name: string | null }> | null;
  sentences: FfSatz[] | null;
  summary: { overview: string | null; action_items: string | null; short_summary: string | null } | null;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = process.env.FIREFLIES_API_KEY;
  if (!key) throw new Error('FIREFLIES_API_KEY ist nicht hinterlegt');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || body.errors?.length) throw new Error(`Fireflies: ${body.errors?.[0]?.message ?? res.status}`);
  return body.data as T;
}

export async function ladeTranskript(id: string): Promise<FfTranskript | null> {
  const d = await gql<{ transcript: FfTranskript | null }>(
    `query Transcript($id: String!) {
      transcript(id: $id) {
        id title date duration transcript_url organizer_email
        meeting_attendees { email displayName name }
        sentences { speaker_name text start_time }
        summary { overview action_items short_summary }
      }
    }`,
    { id },
  );
  return d.transcript;
}

/** Transkripte ab einem Datum (zum Nachholen, falls ein Webhook ausgeblieben ist) */
export async function listeTranskripte(ab: Date, limit = 50): Promise<Array<{ id: string; title: string | null; date: number | string | null }>> {
  const d = await gql<{ transcripts: Array<{ id: string; title: string | null; date: number | string | null }> }>(
    `query Recent($from: DateTime, $limit: Int) { transcripts(fromDate: $from, limit: $limit) { id title date } }`,
    { from: ab.toISOString(), limit: Math.min(50, limit) },
  );
  return d.transcripts ?? [];
}

export const fireflieLink = (id: string, sekunden?: number) =>
  `https://app.fireflies.ai/view/${id}${sekunden !== undefined ? `?t=${Math.max(0, Math.floor(sekunden))}` : ''}`;

/** „Miró Neumann: 60min Beratungsgespräch mit Felix Zoepp“ → „Miró Neumann“ */
export function nameAusTitel(titel: string | null): string | null {
  if (!titel) return null;
  const vorne = titel.split(':')[0]?.trim() ?? '';
  if (!vorne || vorne === titel.trim()) {
    // Titel ohne Doppelpunkt, z. B. „Sinan Kilic“ – nur übernehmen, wenn er wie ein Name aussieht
    return /^[\p{L}'-]+(?:\s[\p{L}'-]+){1,3}$/u.test(titel.trim()) ? titel.trim() : null;
  }
  // „Murat Aslan & Sedat Özdemir“ → erster Name
  return vorne.split(/\s*(?:&|und|,)\s*/)[0]?.trim() || null;
}

/** Alle Personennamen aus dem Titel („Murat Aslan & Sedat Özdemir: …“ → beide) */
export function namenAusTitel(titel: string | null): string[] {
  const erster = nameAusTitel(titel);
  if (!erster || !titel) return [];
  const vorne = titel.includes(':') ? titel.split(':')[0] : titel;
  const alle = vorne.split(/\s*(?:&|und|,)\s*/).map((x) => x.trim()).filter((x) => /^[\p{L}'-]+(?:\s[\p{L}'-]+){1,3}$/u.test(x));
  return alle.length ? alle : [erster];
}

export function datumVon(t: { date: number | string | null }): Date | null {
  if (t.date === null || t.date === undefined) return null;
  const d = typeof t.date === 'number' ? new Date(t.date) : new Date(/^\d+$/.test(t.date) ? Number(t.date) : t.date);
  return isNaN(d.getTime()) ? null : d;
}
