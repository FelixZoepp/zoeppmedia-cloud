'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, PageHeader, SegmentedControl } from '@/components/ui';

interface Anfrage {
  id: string;
  agency_id: string;
  art: 'frage' | 'problem' | 'wunsch' | 'interesse';
  thema: string;
  nachricht: string | null;
  status: 'offen' | 'in_bearbeitung' | 'erledigt';
  antwort: string | null;
  created_at: string;
  kunde: string;
  logo_url: string | null;
  von: string | null;
  bearbeiter: string | null;
}

const ART_LABEL: Record<Anfrage['art'], string> = { frage: 'Frage', problem: 'Problem', wunsch: 'Wunsch', interesse: 'Upsell-Interesse' };
const STATUS_LABEL: Record<Anfrage['status'], string> = { offen: 'Offen', in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt' };
const STATUS_TONE: Record<Anfrage['status'], 'warning' | 'softAccent' | 'success'> = { offen: 'warning', in_bearbeitung: 'softAccent', erledigt: 'success' };

export function SupportAdminClient() {
  const [liste, setListe] = useState<Anfrage[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [status, setStatus] = useState('offen');
  const [art, setArt] = useState('alle');

  const laden = useCallback(async (s: string) => {
    try {
      const r = await fetch(`/api/admin/support${s === 'alle' ? '' : `?status=${s}`}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Fehler');
      setListe(d);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Anfragen konnten nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => laden(status), 0);
    return () => clearTimeout(t);
  }, [laden, status]);

  const sichtbar = (liste ?? []).filter((a) => art === 'alle' || (art === 'interesse' ? a.art === 'interesse' : a.art !== 'interesse'));
  const interesse = (liste ?? []).filter((a) => a.art === 'interesse').length;

  return (
    <div>
      <PageHeader title="Kunden-Anfragen" description="Fragen, Probleme und Wünsche aus FAQ & Support – plus Upsell-Interesse aus den Empfehlungen." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          items={[
            { value: 'offen', label: 'Offen' },
            { value: 'in_bearbeitung', label: 'In Bearbeitung' },
            { value: 'erledigt', label: 'Erledigt' },
            { value: 'alle', label: 'Alle' },
          ]}
          value={status}
          onChange={(v) => {
            setListe(null);
            setStatus(v);
          }}
        />
        <SegmentedControl
          items={[
            { value: 'alle', label: 'Alle Arten' },
            { value: 'interesse', label: `Upsell-Interesse (${interesse})` },
            { value: 'support', label: 'Support' },
          ]}
          value={art}
          onChange={setArt}
        />
      </div>

      {fehler && (
        <Card className="mb-4 flex items-start gap-3 text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[14px]">{fehler}</p>
        </Card>
      )}

      {!liste ? (
        !fehler && (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        )
      ) : sichtbar.length === 0 ? (
        <Card inset>
          <p className="py-10 text-center text-[15px] text-gray-600">Keine Anfragen in dieser Ansicht.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {sichtbar.map((a) => (
            <AnfrageKarte key={a.id} a={a} onGespeichert={() => laden(status)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnfrageKarte({ a, onGespeichert }: { a: Anfrage; onGespeichert: () => void }) {
  const [antwort, setAntwort] = useState(a.antwort ?? '');
  const [speichert, setSpeichert] = useState(false);

  async function speichern(neuerStatus: Anfrage['status']) {
    setSpeichert(true);
    const res = await fetch('/api/admin/support', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, status: neuerStatus, antwort }),
    });
    const d = await res.json().catch(() => ({}));
    setSpeichert(false);
    if (!res.ok) return toast.error(d.error ?? 'Speichern fehlgeschlagen');
    toast.success(neuerStatus === 'erledigt' ? 'Als erledigt markiert' : 'Gespeichert');
    onGespeichert();
  }

  const upsell = a.art === 'interesse';
  return (
    <Card className={`flex flex-col ${upsell ? 'shadow-[inset_0_0_0_2px_var(--r-700)]' : ''}`}>
      <div className="flex items-center gap-3">
        <Avatar name={a.kunde} src={a.logo_url} size={40} />
        <div className="min-w-0 flex-1">
          <Link href={`/clients/${a.agency_id}`} className="block truncate text-[16px] font-medium hover:text-red-800">
            {a.kunde}
          </Link>
          <p className="truncate text-[12.5px] text-gray-500">
            {a.von ?? 'Kunde'} · {new Date(a.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {upsell ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-b from-red-700 to-red-950 px-2.5 py-0.5 text-[12px] font-semibold text-red-50">
            <Rocket className="h-3 w-3" /> Upsell-Interesse
          </span>
        ) : (
          <Badge tone="neutral">{ART_LABEL[a.art]}</Badge>
        )}
      </div>
      <p className="mt-2 text-[16px] font-medium leading-snug">{a.thema}</p>
      {a.nachricht && <p className="mt-1 whitespace-pre-wrap text-[14px] leading-snug text-gray-700">{a.nachricht}</p>}

      <label className="mt-4 block">
        <span className="mb-1 block text-[12.5px] font-medium text-gray-600">Antwort an den Kunden (sieht er unter FAQ & Support)</span>
        <textarea
          value={antwort}
          onChange={(e) => setAntwort(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder={upsell ? 'z. B. Termin vereinbart für …' : 'Antwort schreiben …'}
          className="w-full rounded-[12px] bg-card px-3 py-2 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700)]"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {a.status !== 'in_bearbeitung' && (
          <Button variant="secondary" size="sm" disabled={speichert} onClick={() => speichern('in_bearbeitung')}>
            In Bearbeitung
          </Button>
        )}
        {a.status !== 'erledigt' ? (
          <Button size="sm" disabled={speichert} onClick={() => speichern('erledigt')}>
            {speichert ? <Loader2 className="animate-spin" /> : null} Erledigt
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={speichert} onClick={() => speichern('erledigt')}>
            Antwort speichern
          </Button>
        )}
      </div>
      {a.bearbeiter && <p className="mt-2 text-[12px] text-gray-500">Zuletzt bearbeitet von {a.bearbeiter}</p>}
    </Card>
  );
}
