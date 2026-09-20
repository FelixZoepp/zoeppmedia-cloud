'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function subscribeAndSave(): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

/**
 * Aktiviert Web Push: Bei erteilter Berechtigung wird die Subscription still
 * synchronisiert, sonst erscheint ein dezenter Aktivierungs-Hinweis.
 */
export function PushManager() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      return; // iOS Safari ohne installierte PWA: kein Push möglich
    }
    if (Notification.permission === 'granted') {
      subscribeAndSave().catch(() => {});
    } else if (Notification.permission === 'default') {
      const dismissed = localStorage.getItem('push_prompt_dismissed');
      if (!dismissed) setShowPrompt(true);
    }
  }, []);

  if (!showPrompt) return null;

  const enable = async () => {
    setShowPrompt(false);
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeAndSave().catch(() => {});
    }
  };

  const dismiss = () => {
    localStorage.setItem('push_prompt_dismissed', '1');
    setShowPrompt(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
          <Bell className="h-5 w-5 text-red-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Benachrichtigungen aktivieren</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Erfahre sofort, wenn neue Bewerber reinkommen — direkt auf deinem Handy.
          </p>
          <button
            onClick={enable}
            className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Aktivieren
          </button>
        </div>
        <button onClick={dismiss} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="Schließen">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
