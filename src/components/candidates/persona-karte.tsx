'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Brain, Copy, ExternalLink, Loader2, Lock, RefreshCw, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Bewerber {
  name: string;
  email: string | null;
  persona_status: 'eingeladen' | 'begonnen' | 'abgeschlossen' | null;
  persona_typ: string | null;
  persona_fit: string | null;
  persona_score: number | null;
  persona_warnungen: string[] | null;
  persona_dimensionen: Array<{ key: string; name: string; score: number }> | null;
  persona_report_url: string | null;
  persona_invite_url: string | null;
  persona_eingeladen_am: string | null;
}

interface Daten {
  freigeschaltet: boolean;
  darfSenden: boolean;
  bewerber: Bewerber;
}

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

/** Persona-Test (12 Persona-Typen) auf der Bewerberseite */
export function PersonaKarte({ candidateId }: { candidateId: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [busy, setBusy] = useState<'senden' | 'aktualisieren' | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/candidates/${candidateId}/persona`, { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, [candidateId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function aktion(a: 'senden' | 'aktualisieren') {
    setBusy(a);
    const r = await fetch(`/api/candidates/${candidateId}/persona`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktion: a }),
    });
    const res = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return toast.error(res.error ?? 'Das hat nicht geklappt');
    if (a === 'senden') toast.success(res.perMail ? 'Persona-Test per E-Mail verschickt' : 'Test-Link erstellt – jetzt an den Bewerber schicken');
    else toast.success(res.status === 'abgeschlossen' ? 'Ergebnis geladen' : 'Test noch nicht abgeschlossen');
    await laden();
  }

  if (!d) return null;

  const kopf = (
    <div className="mb-3 flex items-center gap-2">
      <Brain className="h-4 w-4 text-red-800" />
      <h3 className="text-sm font-semibold text-gray-900">Persona-Test</h3>
    </div>
  );

  if (!d.freigeschaltet) {
    return (
      <Card padding="md">
        {kopf}
        <div className="flex items-start gap-3 rounded-[14px] bg-panel p-3.5">
          <Lock className="mt-0.5 h-4 w-4 flex-none text-gray-500" />
          <div>
            <p className="text-[14px] font-medium">Persona-Test freischalten</p>
            <p className="mt-0.5 text-[13px] text-gray-600">Bewerber in 5 Minuten einschätzen: 12 Vertriebstypen, Warnsignale und Interviewleitfaden.</p>
            <Link href="/empfehlungen" className="mt-2 inline-block text-[13px] font-medium text-red-800 hover:underline">
              Mehr erfahren
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const b = d.bewerber;
  const warnungen = b.persona_warnungen ?? [];
  const dims = b.persona_dimensionen ?? [];

  return (
    <Card padding="md">
      {kopf}
      {!b.persona_status ? (
        <div>
          <p className="text-[13.5px] text-gray-600">
            {b.email ? `Der Test geht per E-Mail an ${b.email}.` : 'Ohne E-Mail-Adresse bekommst du einen Link zum Weitergeben (z. B. per WhatsApp).'}
          </p>
          {d.darfSenden && (
            <Button className="mt-3 w-full" onClick={() => aktion('senden')} disabled={busy !== null}>
              {busy === 'senden' ? <Loader2 className="animate-spin" /> : <Send />} Persona-Test senden
            </Button>
          )}
        </div>
      ) : b.persona_status !== 'abgeschlossen' ? (
        <div className="space-y-3">
          <p className="text-[13.5px]">
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-800">{b.persona_status === 'begonnen' ? 'Begonnen' : 'Eingeladen'}</span>
            <span className="ml-2 text-gray-600">am {datum(b.persona_eingeladen_am)}</span>
          </p>
          {b.persona_invite_url && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(b.persona_invite_url!);
                toast.success('Link kopiert – z. B. per WhatsApp schicken');
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-card py-2.5 text-[14px] font-medium shadow-[inset_0_0_0_1.5px_var(--hair)] hover:bg-panel"
            >
              <Copy className="h-4 w-4" /> Test-Link kopieren
            </button>
          )}
          {d.darfSenden && (
            <Button variant="secondary" className="w-full" onClick={() => aktion('aktualisieren')} disabled={busy !== null}>
              {busy === 'aktualisieren' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Status aktualisieren
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-[20px] font-semibold tracking-[-0.02em]">{b.persona_typ ?? 'Ergebnis'}</p>
            {b.persona_fit && <p className="text-[13px] font-medium text-red-800">{b.persona_fit}</p>}
          </div>
          {b.persona_score !== null && (
            <div>
              <div className="flex justify-between text-[12.5px] text-gray-600">
                <span>Gesamtwert</span>
                <span className="font-semibold text-ink">{b.persona_score} / 100</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-950" style={{ width: `${Math.max(2, Math.min(100, b.persona_score))}%` }} />
              </div>
            </div>
          )}
          {warnungen.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {warnungen.map((w) => (
                <span key={w} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-medium text-red-800">
                  <AlertTriangle className="h-3 w-3" /> {w}
                </span>
              ))}
            </div>
          )}
          {dims.length > 0 && (
            <ul className="space-y-1.5">
              {dims.slice(0, 8).map((x) => (
                <li key={x.key} className="text-[12.5px]">
                  <div className="flex justify-between text-gray-600">
                    <span>{x.name}</span>
                    <span>{x.score}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-red-300" style={{ width: `${Math.max(2, Math.min(100, x.score))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {b.persona_report_url && (
            <a
              href={b.persona_report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-red-700 to-red-950 py-2.5 text-[14px] font-medium text-red-50"
            >
              <ExternalLink className="h-4 w-4" /> Report öffnen
            </a>
          )}
        </div>
      )}
    </Card>
  );
}
