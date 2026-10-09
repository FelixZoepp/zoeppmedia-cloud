import type { AufgabenStatus, Prioritaet } from '@/lib/aufgaben/konstanten';
import type { Board } from '@/lib/aufgaben/boards';
import type { Rhythmus } from '@/lib/aufgaben/regeln';

export interface Aufgabe {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  board_id: string | null;
  status: AufgabenStatus | 'backlog';
  priority: Prioritaet;
  due_date: string | null;
  quelle: string | null;
  serie_id: string | null;
  position: number | null;
  agency_id: string | null;
  created_by: string | null;
  created_at: string;
  erledigt_am: string | null;
  agencies: { name: string } | null;
}

export interface Serie {
  id: string;
  board_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  priority: Prioritaet;
  rhythmus: Rhythmus;
  wochentag: number | null;
  monatstag: number | null;
  nur_werktags: boolean;
  aktiv: boolean;
  naechste_am: string;
  letzte_am: string | null;
}

export interface Person {
  id: string;
  name: string;
  funktion: string | null;
  avatar_url: string | null;
  role: string;
}

export interface BoardDaten {
  ich: { id: string; name: string; role: string };
  team: Person[];
  boards: Board[];
  aufgaben: Aufgabe[];
  serien: Serie[];
}

export const heuteIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
export const datumKurz = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
export const PRIO_FARBE: Record<Prioritaet, string> = { low: 'bg-gray-300', medium: 'bg-sky-400', high: 'bg-amber-500', urgent: 'bg-red-600' };
export const inputCls = 'w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm';
export const plusTage = (tag: string, n: number) => new Date(new Date(`${tag}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
