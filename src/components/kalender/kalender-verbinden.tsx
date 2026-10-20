'use client';

/**
 * Kalender verbinden – Google, Outlook/Microsoft 365 oder Apple (iCloud), jeweils mit Schritt-für-Schritt-Anleitung.
 * Genutzt im Onboarding (Schritt „Kalender“) und unter Einstellungen → Kalender.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck, CalendarX, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Anbieter = 'google' | 'microsoft' | 'apple';

interface Status {
  verbindung: { provider: Anbieter; konto_email: string | null; fehler: string | null; created_at: string } | null;
  google: boolean;
  microsoft: boolean;
  apple: boolean;
  darfVerbinden?: boolean;
}

export const KALENDER_NAME: Record<Anbieter, string> = { google: 'Google Kalender', microsoft: 'Outlook / Microsoft 365', apple: 'Apple Kalender (iCloud)' };

/** Anleitungen (Stand Oktober 2026) */
const ANLEITUNG: Record<Anbieter, string[]> = {
  google: [
    'Unten auf „Mit Google Kalender verbinden“ klicken.',
    'Das Google-Konto wählen, in dem deine Termine stehen (meist dein Firmenkonto).',
    'Google fragt, ob die Zoepp Cloud auf deinen Kalender zugreifen darf: alle Kalender-Häkchen setzen und auf „Weiter“ klicken.',
    'Du landest automatisch wieder hier – fertig. Der Kalender steht dann oben als „verbunden“.',
  ],
  microsoft: [
    'Unten auf „Mit Outlook / Microsoft 365 verbinden“ klicken.',
    'Mit deiner Outlook- oder Firmen-E-Mail (Microsoft 365) anmelden.',
    'Bei „Angeforderte Berechtigungen“ auf „Akzeptieren“ klicken.',
    'Steht dort „Administratorgenehmigung erforderlich“: Deine IT muss den Zugriff einmal freigeben – oder du verbindest ein anderes Outlook-Konto.',
    'Du landest automatisch wieder hier – fertig.',
  ],
  apple: [
    'Apple braucht für fremde Programme ein eigenes Passwort. Öffne dafür appleid.apple.com und melde dich mit deiner Apple-ID an.',
    'Klicke auf „Anmeldung und Sicherheit“ → „App-spezifische Passwörter“.',
    'Klicke auf „+“ bzw. „App-spezifisches Passwort generieren“, gib als Namen „Zoepp Cloud“ ein und bestätige mit deinem Apple-Passwort.',
    'Apple zeigt dir ein Passwort aus 16 Buchstaben (xxxx-xxxx-xxxx-xxxx). Kopiere es.',
    'Trage unten deine Apple-ID (E-Mail) und dieses Passwort ein und klicke auf „Apple Kalender verbinden“. Dein normales Apple-Passwort funktioniert hier nicht.',
    'Hinweis: App-spezifische Passwörter gibt es nur mit Zwei-Faktor-Authentifizierung – die ist bei fast allen Apple-IDs schon an.',
  ],
};

export function KalenderVerbinden({ zurueck = 'settings', onVerbunden }: { zurueck?: 'onboarding' | 'settings'; onVerbunden?: () => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [offen, setOffen] = useState<Anbieter | null>(null);
  const [appleId, setAppleId] = useState('');
  const [passwort, setPasswort] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    const r = await fetch('/api/kalender/status', { cache: 'no-store' });
    if (r.ok) setS(await r.json());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void laden();
      const q = new URLSearchParams(window.location.search);
      if (!q.get('kalender') && zurueck === 'onboarding') return;
      if (q.get('verbunden')) {
        toast.success('Kalender verbunden – Termine landen ab jetzt direkt in deinem Kalender');
        onVerbunden?.();
      }
      const f = q.get('fehler');
      if (f) toast.error(f === 'abgelaufen' ? 'Anmeldung abgelaufen – bitte erneut verbinden' : `Verbindung fehlgeschlagen: ${f}`);
    }, 0);
    return () => clearTimeout(t);
  }, [laden, zurueck, onVerbunden]);

  const apple = async () => {
    setLaeuft(true);
    const r = await fetch('/api/kalender/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apple_id: appleId, passwort }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; kalender?: string };
    setLaeuft(false);
    if (!r.ok) return toast.error(d.error ?? 'Verbindung fehlgeschlagen');
    toast.success(`Apple Kalender verbunden${d.kalender ? ` („${d.kalender}“)` : ''}`);
    setPasswort('');
    await laden();
    onVerbunden?.();
  };

  const trennen = async () => {
    if (!confirm('Kalender wirklich trennen? Neue Termine werden dann nicht mehr automatisch eingetragen.')) return;
    const r = await fetch('/api/kalender/status', { method: 'DELETE' });
    if (!r.ok) return toast.error('Trennen fehlgeschlagen');
    toast.success('Kalender getrennt');
    void laden();
  };

  if (!s) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-red-700" />
      </div>
    );
  }

  const v = s.verbindung;
  const bereit: Record<Anbieter, boolean> = { google: s.google, microsoft: s.microsoft, apple: s.apple };

  return (
    <div className="space-y-4">
      {v && (
        <div className="flex flex-wrap items-start gap-3 rounded-[14px] bg-green-50 p-4">
          <CalendarCheck className="h-6 w-6 flex-none text-green-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">{KALENDER_NAME[v.provider]} verbunden</p>
            <p className="text-[13.5px] text-gray-600">
              {v.konto_email ?? ''} · seit {new Date(v.created_at).toLocaleDateString('de-DE')}
            </p>
            {v.fehler && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[13px] text-amber-800">Zugriff gestört: {v.fehler} – bitte unten erneut verbinden.</p>}
          </div>
          {s.darfVerbinden !== false && (
            <Button variant="ghost" onClick={trennen}>
              <CalendarX className="h-4 w-4" /> Trennen
            </Button>
          )}
        </div>
      )}

      {(!v || v.fehler) && (
        <>
          <p className="text-[14px] text-gray-600">
            Wähle aus, wo deine Termine stehen. Wir lesen nur, wann du belegt bist, und tragen Vorstellungsgespräche und Probetage direkt bei dir ein.
          </p>
          {s.darfVerbinden === false && <p className="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">Den Kalender verbindet der Inhaber eures Kontos.</p>}
          <ul className="space-y-2">
            {(['google', 'microsoft', 'apple'] as Anbieter[]).map((a) => (
              <li key={a} className="rounded-[14px] border border-gray-200">
                <button type="button" onClick={() => setOffen(offen === a ? null : a)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                  <span className="text-[15px] font-medium">{KALENDER_NAME[a]}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${offen === a ? 'rotate-180' : ''}`} />
                </button>
                {offen === a && (
                  <div className="space-y-3 border-t border-gray-200 px-4 pb-4 pt-3">
                    <ol className="list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-gray-700 marker:font-medium marker:text-red-800">
                      {ANLEITUNG[a].map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                    {!bereit[a] ? (
                      <p className="text-[13px] text-amber-700">Diese Anbindung richtet Zoepp Media gerade ein – bitte vorerst einen anderen Kalender wählen oder später verbinden.</p>
                    ) : s.darfVerbinden === false ? null : a === 'apple' ? (
                      <div className="space-y-2">
                        <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[14px] font-medium text-red-800 hover:underline">
                          appleid.apple.com öffnen <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <Input type="email" value={appleId} onChange={(e) => setAppleId(e.target.value)} placeholder="Apple-ID (E-Mail)" autoComplete="username" />
                        <Input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} placeholder="App-spezifisches Passwort (xxxx-xxxx-xxxx-xxxx)" autoComplete="off" />
                        <Button onClick={apple} disabled={laeuft || !appleId || !passwort}>
                          {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Apple Kalender verbinden
                        </Button>
                      </div>
                    ) : (
                      <a
                        href={`/api/kalender/verbinden?provider=${a}&zurueck=${zurueck}`}
                        className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-b from-red-700 to-red-950 px-5 text-[15px] font-medium text-white"
                      >
                        Mit {KALENDER_NAME[a]} verbinden
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
