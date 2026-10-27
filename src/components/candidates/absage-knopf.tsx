'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { canWriteRole } from '@/lib/recruiting/scope';
import type { AbsageUndo } from '@/lib/recruiting/schnell-absage';
import { absageLabel } from '@/lib/recruiting/absagegruende';
import { AbsageDialog } from './absage-dialog';

export interface AbsageErgebnis {
  stageId: string;
  vorherStageId: string | null;
  rueckgaengig: AbsageUndo;
  gestoppt: {
    anrufe: boolean;
    gespraeche: number;
    jobs: number;
    termine: number;
  };
}

// Rolle einmal pro Seite laden – Betrachter (agency_viewer) sehen den Knopf nicht
let rolleLaden: Promise<boolean> | null = null;
function darfSchreibenLaden(): Promise<boolean> {
  rolleLaden ??= fetch('/api/auth/me')
    .then((r) => (r.ok ? r.json() : null))
    .then((u: { role?: string } | null) => !!u?.role && canWriteRole(u.role))
    .catch(() => false);
  return rolleLaden;
}

function useDarfSchreiben(vorgabe?: boolean): boolean {
  const [darf, setDarf] = useState(false);
  useEffect(() => {
    if (vorgabe !== undefined) return;
    let aktiv = true;
    void darfSchreibenLaden().then((d) => aktiv && setDarf(d));
    return () => {
      aktiv = false;
    };
  }, [vorgabe]);
  return vorgabe ?? darf;
}

/** Absage an den Server schicken (✕-Knopf, Kanban-Drag, Bewerberakte). Toast mit „Rückgängig“. */
export async function bewerberAbsagen(
  candidateId: string,
  absage: { code: string; notiz: string | null },
  name?: string,
  onWiederhergestellt?: (e: AbsageErgebnis) => void,
): Promise<AbsageErgebnis | null> {
  const res = await fetch(`/api/candidates/${candidateId}/absagen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(absage),
  }).catch(() => null);
  const d = (await res?.json().catch(() => ({}))) as (AbsageErgebnis & { error?: string }) | undefined;
  if (!res?.ok || !d) {
    toast.error(d?.error ?? 'Absage fehlgeschlagen');
    return null;
  }
  toast(`Abgesagt: ${absageLabel(absage.code)}`, {
    description: name ? `${name} – keine Nachricht an den Bewerber` : 'Keine Nachricht an den Bewerber',
    duration: 8000,
    action: {
      label: 'Rückgängig',
      onClick: () => void absageRueckgaengig(candidateId, d, onWiederhergestellt),
    },
  });
  return d;
}

async function absageRueckgaengig(candidateId: string, e: AbsageErgebnis, onWiederhergestellt?: (e: AbsageErgebnis) => void) {
  const res = await fetch(`/api/candidates/${candidateId}/absagen/rueckgaengig`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...e.rueckgaengig,
      vorherStageId: e.vorherStageId,
    }),
  }).catch(() => null);
  if (!res?.ok) {
    const d = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    toast.error(d?.error ?? 'Rückgängig fehlgeschlagen');
    return;
  }
  toast.success('Wiederhergestellt – Anrufversuche ggf. neu starten');
  onWiederhergestellt?.(e);
}

/**
 * „✕ Absagen“: Absagegrund wählen (Pflicht), keine Nachricht an den Bewerber.
 * Toast mit „Rückgängig“. Klick/Drag der umgebenden Karte wird nicht ausgelöst.
 */
export function AbsageKnopf({
  candidateId,
  name,
  variante = 'icon',
  abgesagt = false,
  schreiben,
  onAbgesagt,
  onWiederhergestellt,
  className = '',
}: {
  candidateId: string;
  name?: string;
  /** icon = kleines ✕ (Karten, Listen), label = „✕ Absagen“ (Detail) */
  variante?: 'icon' | 'label';
  abgesagt?: boolean;
  /** Schreibrecht schon bekannt (z. B. Dialer) – sonst wird die Rolle geladen */
  schreiben?: boolean;
  onAbgesagt?: (e: AbsageErgebnis) => void;
  onWiederhergestellt?: (e: AbsageErgebnis) => void;
  className?: string;
}) {
  const darf = useDarfSchreiben(schreiben);
  const [laeuft, setLaeuft] = useState(false);
  const [offen, setOffen] = useState(false);
  if (!darf || abgesagt) return null;

  function oeffnen(ev: React.MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    setOffen(true);
  }

  async function bestaetigt(absage: { code: string; notiz: string | null }) {
    if (laeuft) return;
    setLaeuft(true);
    const d = await bewerberAbsagen(candidateId, absage, name, onWiederhergestellt);
    setLaeuft(false);
    if (!d) return;
    setOffen(false);
    onAbgesagt?.(d);
  }

  const stopp = (ev: React.SyntheticEvent) => ev.stopPropagation();
  const gemeinsam = {
    type: 'button' as const,
    onClick: oeffnen,
    onPointerDown: stopp,
    onMouseDown: stopp,
    onTouchStart: stopp,
    onKeyDown: stopp,
    disabled: laeuft,
    title: 'Absagen mit Grund (ohne Nachricht an den Bewerber)',
    'aria-label': name ? `${name} absagen` : 'Absagen',
  };

  if (variante === 'label') {
    return (
      <>
        <button
          {...gemeinsam}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-50 px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 cursor-pointer ${className}`}
        >
          <X className="h-3.5 w-3.5" />
          Absagen
        </button>
        <AbsageDialog open={offen} name={name} laeuft={laeuft} onClose={() => setOffen(false)} onBestaetigt={(a) => void bestaetigt(a)} />
      </>
    );
  }

  return (
    <>
      <button
        {...gemeinsam}
        className={`grid h-7 w-7 flex-none place-items-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 cursor-pointer ${className}`}
      >
        <X className="h-4 w-4" />
      </button>
      <AbsageDialog open={offen} name={name} laeuft={laeuft} onClose={() => setOffen(false)} onBestaetigt={(a) => void bestaetigt(a)} />
    </>
  );
}
