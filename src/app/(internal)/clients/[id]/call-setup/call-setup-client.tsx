'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from 'sonner';
import { ArrowLeft, PhoneOutgoing, FileText } from 'lucide-react';

interface CallSetupData {
  agency: { id: string; name: string; outbound_phone: string | null };
  scripts: Record<string, string>;
}

const SCRIPT_DEFS: { type: string; label: string; hint: string }[] = [
  {
    type: 'erstkontakt',
    label: 'Erstkontakt-Skript',
    hint: 'Wird im Dialer bei neuen Bewerbern, Kadenz-Anrufen und Rückrufen angezeigt.',
  },
  {
    type: 'erinnerung_vg',
    label: 'Erinnerung Vorstellungsgespräch',
    hint: 'Wird beim Erinnerungsanruf vor einem Vorstellungsgespräch angezeigt.',
  },
  {
    type: 'erinnerung_probetag',
    label: 'Erinnerung Probetag',
    hint: 'Wird beim Erinnerungsanruf vor einem Probetag angezeigt.',
  },
];

export function CallSetupClient({ agencyId }: { agencyId: string }) {
  const [data, setData] = useState<CallSetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/call-setup/${agencyId}`);
    if (res.ok) {
      const d: CallSetupData = await res.json();
      setData(d);
      setPhone(d.agency.outbound_phone ?? '');
      setScripts({
        erstkontakt: d.scripts.erstkontakt ?? '',
        erinnerung_vg: d.scripts.erinnerung_vg ?? '',
        erinnerung_probetag: d.scripts.erinnerung_probetag ?? '',
      });
    }
    setLoading(false);
  }, [agencyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/admin/call-setup/${agencyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outbound_phone: phone, scripts }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Gespeichert');
      load();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? 'Speichern fehlgeschlagen');
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link
        href={`/clients/${agencyId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Zurück zum Kunden
      </Link>

      <PageHeader
        label="CALL-SETUP"
        title={data.agency.name}
        description="Büro-Nummer und Call-Skripte für den Innendienst-Dialer"
      />

      {/* Büro-Nummer */}
      <Card padding="lg" className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <PhoneOutgoing size={16} className="text-red-600" />
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Büro-Nummer (Outbound)
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Mit dieser Nummer callt der Innendienst für diesen Kunden. Wird im Dialer bei jedem
          Anruf angezeigt (&quot;Callen mit: …&quot;).
        </p>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+49 30 12345678"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none bg-white"
        />
      </Card>

      {/* Skripte */}
      {SCRIPT_DEFS.map((def) => (
        <Card padding="lg" className="mb-6" key={def.type}>
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-red-600" />
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              {def.label}
            </h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">{def.hint}</p>
          <textarea
            value={scripts[def.type] ?? ''}
            onChange={(e) => setScripts((prev) => ({ ...prev, [def.type]: e.target.value }))}
            rows={8}
            placeholder="Skript-Text eingeben…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none bg-white leading-relaxed"
          />
        </Card>
      ))}

      <Button variant="primary" size="md" onClick={save} disabled={saving} glow>
        {saving ? 'Speichern…' : 'Alles speichern'}
      </Button>
    </div>
  );
}
