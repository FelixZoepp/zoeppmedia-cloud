'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, Link2Off, Send } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

interface Ergebnis {
  url: string | null;
  kunden_version: number | null;
  kunden_status: string | null;
}

/** Kunden-Freigabelink erstellen, kopieren, deaktivieren und eine Version bewusst an den Kunden geben */
export function KundenLinkModal({
  videoId,
  link,
  kundenStatus,
  kundenVersion,
  aktuelleVersion,
  darf,
  onClose,
  onAenderung,
}: {
  videoId: string;
  link: string | null;
  kundenStatus: string | null;
  kundenVersion: number | null;
  aktuelleVersion: number;
  darf: boolean;
  onClose: () => void;
  onAenderung: (e: Ergebnis) => void;
}) {
  const [laedt, setLaedt] = useState(false);

  const erstellen = async (teilen = false) => {
    setLaedt(true);
    try {
      const r = await fetch(`/api/videos/${videoId}/freigabelink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teilen }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      onAenderung({ url: j.url, kunden_version: j.kunden_version, kunden_status: j.kunden_status });
      if (teilen) toast.success(`Version ${j.kunden_version} ist jetzt beim Kunden`);
      else {
        await navigator.clipboard?.writeText(j.url).catch(() => {});
        toast.success('Link erstellt und kopiert');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLaedt(false);
    }
  };

  const deaktivieren = async () => {
    if (!confirm('Link deaktivieren? Der Kunde kommt dann nicht mehr auf die Seite.')) return;
    const r = await fetch(`/api/videos/${videoId}/freigabelink`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    onAenderung({ url: null, kunden_version: kundenVersion, kunden_status: kundenStatus });
  };

  return (
    <Modal open onClose={onClose} title="Kunden-Freigabe" width="max-w-lg">
      <div className="space-y-3 text-[14px]">
        <p className="text-gray-600">
          Der Kunde öffnet den Link ohne Login, kommentiert zeitgenau und klickt auf „Freigeben“ oder „Änderungen gewünscht“. Er sieht nur die Version, die ihr intern freigegeben habt – neue
          Versionen erst nach eurer Freigabe. Interne Kommentare sieht er nie. Bearbeiter und Prüfer werden benachrichtigt.
        </p>
        {kundenVersion !== null && (
          <p className="rounded-lg bg-gray-50 p-2.5 text-[13px]">
            Kunde sieht <b>Version {kundenVersion}</b> · Status:{' '}
            <b>{kundenStatus === 'freigegeben' ? 'freigegeben ✅' : kundenStatus === 'aenderungen' ? 'Änderungen gewünscht ✏️' : 'wartet auf Kunde'}</b>
          </p>
        )}
        {!darf && <p className="text-[13px] text-gray-500">Den Link erstellt und verwaltet der Prüfer oder ein Admin.</p>}
        {link ? (
          <>
            <div className="flex gap-2">
              <input readOnly value={link} className="h-10 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 text-[13px]" onFocus={(e) => e.currentTarget.select()} />
              <Button
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(link)
                    .then(() => toast.success('Kopiert'))
                    .catch(() => toast.error('Kopieren nicht möglich'))
                }
              >
                <Copy className="h-4 w-4" /> Kopieren
              </Button>
            </div>
            {darf && kundenVersion !== null && kundenVersion !== aktuelleVersion && (
              <Button variant="secondary" disabled={laedt} onClick={() => confirm(`Version ${aktuelleVersion} jetzt schon an den Kunden geben (vor der internen Freigabe)?`) && erstellen(true)}>
                <Send className="h-4 w-4" /> Version {aktuelleVersion} an Kunden geben
              </Button>
            )}
            {darf && (
              <button type="button" onClick={deaktivieren} className="inline-flex items-center gap-1.5 text-[13px] text-red-700 hover:underline">
                <Link2Off className="h-4 w-4" /> Link deaktivieren
              </button>
            )}
          </>
        ) : (
          darf && (
            <Button onClick={() => erstellen(false)} disabled={laedt}>
              <Link2 className="h-4 w-4" /> Link erstellen (Version {aktuelleVersion})
            </Button>
          )
        )}
      </div>
    </Modal>
  );
}
