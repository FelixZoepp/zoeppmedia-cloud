'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input } from '@/components/ui';
import type { TestleadErgebnis } from '@/lib/fulfillment/testlead';

const ICON = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" />,
  warnung: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />,
  fehler: <XCircle className="h-4 w-4 shrink-0 text-red-700" />,
};

/** Test-Lead durchspielen: Webhook → Cloud → WhatsApp, Schritt hakt sich bei Erfolg selbst ab */
export function TestleadCard({ agencyId, onFertig }: { agencyId: string; onFertig?: () => void }) {
  const [phone, setPhone] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [e, setE] = useState<TestleadErgebnis | null>(null);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/admin/agencies/${agencyId}/testlead`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => aktiv && d?.phone && setPhone(d.phone))
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, [agencyId]);

  async function starten() {
    setLaeuft(true);
    setE(null);
    const r = await fetch(`/api/admin/agencies/${agencyId}/testlead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    setLaeuft(false);
    if (!r.ok) return void toast.error(d.error ?? 'Test fehlgeschlagen');
    setE(d);
    if (d.bestanden) {
      toast.success(d.schrittAbgehakt ? 'Test bestanden – Schritt „Test-Lead“ ist abgehakt' : 'Test bestanden');
      onFertig?.();
    } else toast.error('Test nicht bestanden – siehe Hinweise');
  }

  return (
    <Card className="mb-6">
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <FlaskConical className="h-5 w-5 text-red-800" /> Test-Lead durchspielen
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">
        Schickt einen Test-Bewerber durch den Bewerber-Eingang, prüft Cloud, WhatsApp und Indeed und nimmt ihn danach wieder raus.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-[13px] font-medium text-gray-700">
          Deine Handynummer (für den WhatsApp-Test, optional)
          <Input value={phone} onChange={(ev) => setPhone(ev.target.value)} placeholder="+49 170 …" />
        </label>
        <Button onClick={starten} disabled={laeuft}>
          {laeuft ? 'Läuft … (ca. 10 Sek.)' : 'Test starten'}
        </Button>
      </div>
      {e && (
        <ul className="mt-4 space-y-2 border-t border-gray-100 pt-3">
          {e.punkte.map((p) => (
            <li key={p.key} className="flex gap-2.5 text-[14px] leading-snug">
              {ICON[p.status]}
              <span>
                <strong className="font-semibold">{p.label}:</strong> {p.hinweis}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
