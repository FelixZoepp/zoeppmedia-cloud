'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Phone } from 'lucide-react';
import { Card } from '@/components/ui';
import { nummerAnzeigen } from '@/lib/twilio/nummer';

interface NummerDaten {
  nummer: string | null;
  code_empfang_bis: string | null;
  codes: Array<{ code: string; art: string; created_at: string }>;
}

/**
 * Kundenportal: Schritt-für-Schritt-Anleitung „WhatsApp verbinden“ (Meta Embedded Signup).
 * Hat der Kunde eine Nummer von uns, steht sie hier – und der Bestätigungscode von Meta erscheint live,
 * sobald Meta anruft. So kann jeder Kunde die Verbindung ohne Termin mit uns selbst herstellen.
 */
export function VerbindenAnleitung({ onStart, kannStarten, arbeitet }: { onStart: () => void; kannStarten: boolean; arbeitet: boolean }) {
  const [d, setD] = useState<NummerDaten | null>(null);
  const [offen, setOffen] = useState(false);

  const laden = useCallback(async () => {
    const r = await fetch('/api/whatsapp/nummer', { cache: 'no-store' });
    if (!r.ok) return;
    const x = (await r.json()) as NummerDaten;
    setD(x);
    setOffen(!!x.code_empfang_bis && new Date(x.code_empfang_bis).getTime() > Date.now());
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  // Während der Code-Empfang offen ist, alle 4 Sekunden nachsehen
  useEffect(() => {
    if (!offen) return;
    const t = setInterval(laden, 4000);
    return () => clearInterval(t);
  }, [offen, laden]);

  async function starten() {
    // Eigene Nummer: Code-Empfang 15 Min. öffnen, dann das Meta-Fenster
    if (d?.nummer) {
      await fetch('/api/whatsapp/nummer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'code_empfang' }) }).catch(() => {});
      void laden();
    }
    onStart();
  }

  const code = d?.codes[0];
  const schritte: Array<{ titel: string; text: React.ReactNode }> = [
    {
      titel: 'Meta-Fenster öffnen',
      text: 'Klick unten auf „WhatsApp verbinden“ und melde dich mit deinem Facebook-Konto an (am besten das des Inhabers). Das Fenster gehört zu Meta – wir sehen dein Passwort nicht.',
    },
    {
      titel: 'Unternehmen auswählen oder anlegen',
      text: 'Wähle dein Unternehmensportfolio. Hast du noch keins, leg es direkt an: Firmenname wie im Impressum, Website, Land Deutschland.',
    },
    {
      titel: 'WhatsApp-Konto und Anzeigename',
      text: 'Wähle „Neues WhatsApp-Business-Konto erstellen“. Als Anzeigenamen deinen Firmennamen (so sehen ihn die Bewerber). Kategorie z. B. „Dienstleistungen“.',
    },
    {
      titel: 'Nummer eintragen und bestätigen',
      text: d?.nummer ? (
        <>
          Trag genau diese Nummer ein: <strong className="whitespace-nowrap">{nummerAnzeigen(d.nummer)}</strong>. Wähle als Bestätigung <strong>„Anruf“</strong>. Der Code erscheint
          dann hier unten automatisch – einfach abtippen.
        </>
      ) : (
        <>
          Nimm eine Nummer, die <strong>nicht</strong> in der normalen WhatsApp- oder WhatsApp-Business-App aktiv ist (sonst dort vorher das Konto löschen). Du bekommst einen
          Code per SMS oder Anruf. Keine passende Nummer? Schreib uns – wir besorgen dir eine.
        </>
      ),
    },
    {
      titel: 'Fertig',
      text: 'Bestätigen – das war’s. Die Cloud reicht alle Nachrichten-Vorlagen automatisch bei Meta ein (Status siehst du unten). Sobald sie freigegeben sind, schreibt der Assistent neue Bewerber an.',
    },
  ];

  return (
    <Card padding="md" className="mb-6">
      <h2 className="text-sm font-semibold text-gray-900">So verbindest du WhatsApp (ca. 10 Minuten)</h2>
      {d?.nummer && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <Phone className="h-4 w-4 flex-none" /> Deine neue WhatsApp-Nummer: <strong>{nummerAnzeigen(d.nummer)}</strong>
        </p>
      )}
      <ol className="mt-4 space-y-3">
        {schritte.map((s, i) => (
          <li key={s.titel} className="flex gap-3">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-red-100 text-[12.5px] font-semibold text-red-900">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{s.titel}</p>
              <p className="text-sm text-gray-600">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {d?.nummer && (offen || code) && (
        <div className="mt-4 rounded-xl bg-panel p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <KeyRound className="h-4 w-4 text-red-800" /> Bestätigungscode von Meta
          </p>
          {code ? (
            <p className="mt-2 flex items-center gap-3">
              <span className="font-mono text-[28px] font-semibold tracking-[0.2em]">{code.code}</span>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-[12.5px] text-gray-500">{new Date(code.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-600">Wartet auf den Anruf von Meta … Wähle in Schritt 4 „Anruf“ – der Code erscheint hier von selbst.</p>
          )}
        </div>
      )}

      {kannStarten && (
        <button
          onClick={() => void starten()}
          disabled={arbeitet}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-b from-green-600 to-green-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Phone className="h-4 w-4" /> {arbeitet ? 'Wird eingerichtet …' : 'WhatsApp verbinden'}
        </button>
      )}
    </Card>
  );
}
