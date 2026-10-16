'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { canWriteRole } from '@/lib/recruiting/scope';
import type { AbsageUndo } from '@/lib/recruiting/schnell-absage';

export interface AbsageErgebnis {
  stageId: string;
  vorherStageId: string | null;
  rueckgaengig: AbsageUndo;
  gestoppt: { anrufe: boolean; gespraeche: number; jobs: number; termine: number };
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

/**
 * „✕ Absagen“: Bewerber mit einem Klick absagen – ohne Grund, ohne Nachricht an den Bewerber.
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
  if (!darf || abgesagt) return null;

  async function rueckgaengig(e: AbsageErgebnis) {
    const res = await fetch(`/api/candidates/${candidateId}/absagen/rueckgaengig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...e.rueckgaengig, vorherStageId: e.vorherStageId }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      toast.error(d?.error ?? 'Rückgängig fehlgeschlagen');
      return;
    }
    toast.success('Wiederhergestellt – Anrufversuche ggf. neu starten');
    onWiederhergestellt?.(e);
  }

  async function absagen(ev: React.MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    if (laeuft) return;
    setLaeuft(true);
    const res = await fetch(`/api/candidates/${candidateId}/absagen`, { method: 'POST' }).catch(() => null);
    setLaeuft(false);
    const d = (await res?.json().catch(() => ({}))) as (AbsageErgebnis & { error?: string }) | undefined;
    if (!res?.ok || !d) {
      toast.error(d?.error ?? 'Absage fehlgeschlagen');
      return;
    }
    onAbgesagt?.(d);
    toast('Abgesagt', {
      description: name ? `${name} – keine Nachricht an den Bewerber` : 'Keine Nachricht an den Bewerber',
      duration: 8000,
      action: { label: 'Rückgängig', onClick: () => void rueckgaengig(d) },
    });
  }

  const stopp = (ev: React.SyntheticEvent) => ev.stopPropagation();
  const gemeinsam = {
    type: 'button' as const,
    onClick: absagen,
    onPointerDown: stopp,
    onMouseDown: stopp,
    onTouchStart: stopp,
    onKeyDown: stopp,
    disabled: laeuft,
    title: 'Absagen (ohne Nachricht an den Bewerber)',
    'aria-label': name ? `${name} absagen` : 'Absagen',
  };

  if (variante === 'label') {
    return (
      <button
        {...gemeinsam}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-50 px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 cursor-pointer ${className}`}
      >
        <X className="h-3.5 w-3.5" />
        Absagen
      </button>
    );
  }

  return (
    <button
      {...gemeinsam}
      className={`grid h-7 w-7 flex-none place-items-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 cursor-pointer ${className}`}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
