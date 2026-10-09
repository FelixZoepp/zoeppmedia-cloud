'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, Link2Off } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

/** Kunden-Freigabelink erstellen, kopieren, deaktivieren */
export function KundenLinkModal({ videoId, link, kundenStatus, onClose, onAenderung }: { videoId: string; link: string | null; kundenStatus: string | null; onClose: () => void; onAenderung: (link: string | null) => void }) {
  const [laedt, setLaedt] = useState(false);

  const erstellen = async () => {
    setLaedt(true);
    try {
      const r = await fetch(`/api/videos/${videoId}/freigabelink`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      onAenderung(j.url);
      await navigator.clipboard?.writeText(j.url).catch(() => {});
      toast.success('Link erstellt und kopiert');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLaedt(false);
    }
  };

  const deaktivieren = async () => {
    if (!confirm('Link deaktivieren? Der Kunde kommt dann nicht mehr auf die Seite.')) return;
    const r = await fetch(`/api/videos/${videoId}/freigabelink`, { method: 'DELETE' });
    if (!r.ok) return toast.error('Fehler');
    onAenderung(null);
  };

  return (
    <Modal open onClose={onClose} title="Kunden-Freigabe" width="max-w-lg">
      <div className="space-y-3 text-[14px]">
        <p className="text-gray-600">
          Der Kunde öffnet den Link ohne Login, sieht immer die <b>aktuelle Version</b>, kommentiert zeitgenau und klickt auf „Freigeben“ oder „Änderungen gewünscht“. Interne
          Kommentare sieht er nicht. Du und der Bearbeiter bekommt eine Benachrichtigung.
        </p>
        {kundenStatus && (
          <p className="rounded-lg bg-gray-50 p-2.5 text-[13px]">
            Status beim Kunden: <b>{kundenStatus === 'freigegeben' ? 'freigegeben ✅' : kundenStatus === 'aenderungen' ? 'Änderungen gewünscht ✏️' : 'wartet auf Kunde'}</b>
          </p>
        )}
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
            <button type="button" onClick={deaktivieren} className="inline-flex items-center gap-1.5 text-[13px] text-red-700 hover:underline">
              <Link2Off className="h-4 w-4" /> Link deaktivieren
            </button>
          </>
        ) : (
          <Button onClick={erstellen} disabled={laedt}>
            <Link2 className="h-4 w-4" /> Link erstellen
          </Button>
        )}
      </div>
    </Modal>
  );
}
