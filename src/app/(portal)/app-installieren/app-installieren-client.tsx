'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCircle2, Share, MoreVertical, PlusSquare, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button, buttonStyles } from '@/components/ui/button';
import { subscribeAndSave } from '@/components/push-manager';

type Geraet = 'iphone' | 'android' | 'rechner';
type Erlaubnis = 'granted' | 'denied' | 'default' | 'nicht_moeglich';

interface Stand {
  geraet: Geraet;
  alsApp: boolean;
  erlaubnis: Erlaubnis;
}

function leseStand(): Stand {
  const ua = navigator.userAgent;
  const geraet: Geraet = /iphone|ipad|ipod/i.test(ua) ? 'iphone' : /android/i.test(ua) ? 'android' : 'rechner';
  const alsApp =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const pushMoeglich = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { geraet, alsApp, erlaubnis: pushMoeglich ? Notification.permission : 'nicht_moeglich' };
}

function Schritt({ nr, children }: { nr: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-red-50 text-[13px] font-semibold text-red-700">{nr}</span>
      <div className="min-w-0 flex-1 pt-0.5 text-[14.5px] leading-relaxed">{children}</div>
    </li>
  );
}

export function AppInstallierenClient({ nachOnboarding }: { nachOnboarding: boolean }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [geraete, setGeraete] = useState<number | null>(null);
  const [eingerichtet, setEingerichtet] = useState(true);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStand(leseStand()), 0);
    fetch('/api/push/test')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { eingerichtet: boolean; geraete: number } | null) => {
        if (!d) return;
        setEingerichtet(d.eingerichtet);
        setGeraete(d.geraete);
      })
      .catch(() => {});
    return () => clearTimeout(t);
  }, []);

  const aktivieren = async () => {
    setLaeuft(true);
    setMeldung(null);
    try {
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== 'granted') {
        setMeldung('Benachrichtigungen wurden nicht erlaubt. Du kannst sie in den Einstellungen deines Handys für die Zoepp Cloud wieder einschalten.');
        return;
      }
      const ok = await subscribeAndSave();
      setMeldung(ok ? 'Aktiviert! Tippe jetzt auf „Test senden“.' : 'Aktivieren hat nicht geklappt – bitte melde dich bei uns.');
      if (ok) setGeraete((g) => (g ?? 0) + 1);
    } catch {
      setMeldung('Aktivieren hat nicht geklappt – bitte melde dich bei uns.');
    } finally {
      setStand(leseStand());
      setLaeuft(false);
    }
  };

  const testen = async () => {
    setLaeuft(true);
    setMeldung(null);
    try {
      const r = await fetch('/api/push/test', { method: 'POST' });
      const d = (await r.json()) as { eingerichtet: boolean; gesendet: number };
      if (!d.eingerichtet) setMeldung('Benachrichtigungen sind bei uns noch nicht eingerichtet – wir kümmern uns darum.');
      else if (d.gesendet === 0) setMeldung('Für dieses Konto ist noch kein Gerät angemeldet. Tippe zuerst auf „Benachrichtigungen aktivieren“.');
      else setMeldung(`Gesendet an ${d.gesendet} ${d.gesendet === 1 ? 'Gerät' : 'Geräte'} – die Nachricht sollte gleich aufploppen.`);
    } catch {
      setMeldung('Test hat nicht geklappt – bitte später nochmal versuchen.');
    } finally {
      setLaeuft(false);
    }
  };

  const fertig = stand?.erlaubnis === 'granted' && (geraete ?? 0) > 0;
  const iphoneOhneApp = stand?.geraet === 'iphone' && !stand.alsApp;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        label={nachOnboarding ? 'LETZTER SCHRITT' : 'APP'}
        title="Cloud aufs Handy"
        description="Füge die Zoepp Cloud als App zu deinem Startbildschirm hinzu und schalte Benachrichtigungen ein – dann ploppt jeder neue Bewerber sofort auf deinem Handy auf und du rufst ihn in den ersten Minuten an."
      />

      {nachOnboarding && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          Onboarding abgeschlossen – danke! Jetzt noch die Cloud aufs Handy, dann bist du startklar.
        </div>
      )}

      {fertig && (
        <Card className="mb-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 flex-none text-green-700" />
            <div>
              <p className="font-semibold">Benachrichtigungen sind auf diesem Gerät an</p>
              <p className="text-[13.5px] text-gray-600">Neue Bewerber erscheinen ab jetzt sofort als Mitteilung. Mit „Test senden“ kannst du es ausprobieren.</p>
            </div>
          </div>
        </Card>
      )}

      {!eingerichtet && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Benachrichtigungen sind bei uns gerade noch nicht freigeschaltet. Du kannst die App trotzdem schon hinzufügen.
        </div>
      )}

      <Card className="mb-4">
        <div className="mb-4 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-red-700" />
          <h2 className="text-[17px] font-semibold">iPhone (Safari)</h2>
          {stand?.geraet === 'iphone' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Dein Gerät</span>}
        </div>
        <ol className="space-y-3">
          <Schritt nr={1}>
            Öffne <b>cloud.zoeppmedia.de</b> in <b>Safari</b> (nicht in Chrome oder in der WhatsApp-Vorschau).
          </Schritt>
          <Schritt nr={2}>
            Tippe unten auf <Share className="inline h-4 w-4 align-[-2px]" /> <b>Teilen</b>.
          </Schritt>
          <Schritt nr={3}>
            Scrolle runter und tippe auf <PlusSquare className="inline h-4 w-4 align-[-2px]" /> <b>Zum Home-Bildschirm</b> → <b>Hinzufügen</b>.
          </Schritt>
          <Schritt nr={4}>
            Öffne die Cloud ab jetzt <b>über das neue App-Symbol</b> auf deinem Startbildschirm und melde dich an.
          </Schritt>
          <Schritt nr={5}>
            Komm in der App wieder auf diese Seite (Menü → Hilfe oder Startklar-Liste) und tippe auf <b>Benachrichtigungen aktivieren</b> → <b>Erlauben</b>.
          </Schritt>
        </ol>
        <p className="mt-4 text-[13px] text-gray-500">
          Wichtig: Apple erlaubt Benachrichtigungen nur aus der App auf dem Home-Bildschirm, nicht aus dem normalen Safari-Tab. Unter Einstellungen →
          Mitteilungen → Zoepp Cloud sollten „Mitteilungen erlauben“ und „Sofort“ aktiv sein.
        </p>
      </Card>

      <Card className="mb-4">
        <div className="mb-4 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-red-700" />
          <h2 className="text-[17px] font-semibold">Android (Chrome)</h2>
          {stand?.geraet === 'android' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Dein Gerät</span>}
        </div>
        <ol className="space-y-3">
          <Schritt nr={1}>
            Öffne <b>cloud.zoeppmedia.de</b> in <b>Chrome</b>.
          </Schritt>
          <Schritt nr={2}>
            Tippe oben rechts auf <MoreVertical className="inline h-4 w-4 align-[-2px]" /> → <b>App installieren</b> (oder „Zum Startbildschirm hinzufügen“).
          </Schritt>
          <Schritt nr={3}>
            Tippe hier auf <b>Benachrichtigungen aktivieren</b> → <b>Zulassen</b>.
          </Schritt>
        </ol>
        <p className="mt-4 text-[13px] text-gray-500">
          Tipp: In den Android-Einstellungen unter Apps → Chrome/Zoepp Cloud → Benachrichtigungen „Pop-up“ bzw. „Auf dem Bildschirm anzeigen“ einschalten, damit die Meldung
          oben aufploppt.
        </p>
      </Card>

      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-5 w-5 text-red-700" />
          <h2 className="text-[17px] font-semibold">Benachrichtigungen auf diesem Gerät</h2>
        </div>
        {iphoneOhneApp ? (
          <p className="text-[14px] text-gray-600">
            Du bist gerade im Safari-Tab. Füge die Cloud zuerst wie oben beschrieben zum Home-Bildschirm hinzu und öffne diese Seite dann in der App.
          </p>
        ) : stand?.erlaubnis === 'denied' ? (
          <p className="text-[14px] text-gray-600">
            Benachrichtigungen sind für die Cloud blockiert. Schalte sie in den Einstellungen deines Handys (bzw. im Browser über das Schloss-Symbol) wieder ein und lade die Seite
            neu.
          </p>
        ) : stand?.erlaubnis === 'nicht_moeglich' ? (
          <p className="text-[14px] text-gray-600">Dieser Browser unterstützt keine Benachrichtigungen. Nutze am iPhone Safari, sonst Chrome.</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {stand && stand.erlaubnis !== 'nicht_moeglich' && stand.erlaubnis !== 'denied' && !iphoneOhneApp && (
            <Button onClick={aktivieren} disabled={laeuft}>
              <Bell /> Benachrichtigungen aktivieren
            </Button>
          )}
          <Button variant="secondary" onClick={testen} disabled={laeuft}>
            Test senden
          </Button>
          {nachOnboarding && (
            <Link href="/dashboard" className={buttonStyles('ghost')}>
              Später – zum Dashboard
            </Link>
          )}
        </div>
        {meldung && <p className="mt-3 text-[14px] font-medium text-gray-700">{meldung}</p>}
        {geraete !== null && geraete > 0 && (
          <p className="mt-2 text-[13px] text-gray-500">
            Angemeldete Geräte für dein Konto: {geraete}. Jeder im Team muss das auf seinem eigenen Handy einmal machen.
          </p>
        )}
      </Card>
    </div>
  );
}
