import { PERSONA_API } from './mapping';

/** Schlanker Client für die 12-Persona-Typen-API */
export class PersonaFehler extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fehlertext(status: number): string {
  if (status === 401) return 'Der API-Schlüssel für den Persona-Test ist ungültig.';
  if (status === 402) return 'Im Persona-Test-Konto sind keine Credits mehr frei.';
  if (status === 429) return 'Zu viele Anfragen an den Persona-Test – bitte kurz warten.';
  if (status === 400) return 'Ungültige Angaben für den Persona-Test.';
  return `Der Persona-Test ist gerade nicht erreichbar (HTTP ${status}).`;
}

async function anfrage<T>(schluessel: string, pfad: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${PERSONA_API}${pfad}`, {
    ...init,
    headers: { Authorization: `Bearer ${schluessel}`, 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers },
    cache: 'no-store',
  });
  if (!res.ok) throw new PersonaFehler(res.status, fehlertext(res.status));
  return (await res.json()) as T;
}

export function ladeEin(schluessel: string, input: { name: string; email: string; external_id: string; send_email: boolean }) {
  return anfrage<{ ok: boolean; invite_url?: string; candidate_token?: string; external_id?: string }>(schluessel, '/invites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function holeKandidat(schluessel: string, idOderExtern: string) {
  return anfrage<Record<string, unknown>>(schluessel, `/candidates/${encodeURIComponent(idOderExtern)}`);
}

export function testeVerbindung(schluessel: string) {
  return anfrage<unknown>(schluessel, '/candidates?limit=1');
}
