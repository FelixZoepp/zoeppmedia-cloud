'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Smartphone } from 'lucide-react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const noopSubscribe = () => () => {};

function readEnv(): 'standalone' | 'ios' | 'browser' {
  if (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  ) {
    return 'standalone';
  }
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'browser';
}

/** Dunkle Karte unten in der Sidebar: Zoepp Cloud als App installieren (PWA). */
export function InstallPromo() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [hint, setHint] = useState(false);
  // Server: so tun, als wäre die App installiert → Karte erst im Browser zeigen
  const env = useSyncExternalStore(noopSubscribe, readEnv, () => 'standalone');
  const standalone = env === 'standalone';
  const ios = env === 'ios';

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  // Schon installiert oder Browser kann nicht installieren → nichts zeigen
  if (standalone || (!deferred && !ios)) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else {
      setHint(true);
    }
  }

  return (
    <div className="fx-swirl rounded-xl px-4 pb-4 pt-[18px]">
      <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-red-50 text-red-950">
        <Smartphone className="h-[15px] w-[15px]" />
      </span>
      <p className="mt-3 max-w-[9em] text-[19px] leading-[1.15] tracking-[-0.02em]">Zoepp Cloud als App</p>
      <p className="mt-1.5 text-xs text-red-200">
        {hint ? 'Teilen-Symbol tippen → „Zum Home-Bildschirm“' : 'Alles im Blick, direkt vom Homescreen'}
      </p>
      <button
        onClick={install}
        className="mt-6 block w-full rounded-full bg-red-800 py-2.5 text-center text-[13.5px] font-semibold transition-colors hover:bg-red-700"
      >
        Installieren
      </button>
    </div>
  );
}
