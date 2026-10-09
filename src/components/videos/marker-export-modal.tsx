'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { alsCsv, alsEdl, alsFcpXml, type MarkerKommentar } from '@/lib/videos/marker-export';

function herunterladen(name: string, inhalt: string, typ: string) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Kommentare als Marker für Resolve (EDL), Premiere (XML) oder als Liste (CSV) */
export function MarkerExportModal({ titel, kommentare, dauerS, onClose }: { titel: string; kommentare: MarkerKommentar[]; dauerS: number; onClose: () => void }) {
  const [fps, setFps] = useState(25);
  const [start, setStart] = useState(0);
  const [nurOffene, setNurOffene] = useState(true);
  const liste = kommentare.filter((k) => !nurOffene || !k.erledigt);
  const datei = titel.replace(/[^\wäöüÄÖÜß -]+/g, '').trim().replace(/\s+/g, '_') || 'video';
  const o = { fps, startS: start };
  const sel = 'h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm';

  return (
    <Modal open onClose={onClose} title="Marker exportieren" width="max-w-md">
      <div className="space-y-3 text-[14px]">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-gray-600">Bildrate der Timeline</span>
            <select className={`${sel} w-full`} value={fps} onChange={(e) => setFps(Number(e.target.value))}>
              {[24, 25, 30, 50, 60].map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-gray-600">Start-Timecode</span>
            <select className={`${sel} w-full`} value={start} onChange={(e) => setStart(Number(e.target.value))}>
              <option value={0}>00:00:00:00 (Premiere)</option>
              <option value={3600}>01:00:00:00 (Resolve)</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-gray-600">
          <input type="checkbox" checked={nurOffene} onChange={(e) => setNurOffene(e.target.checked)} /> nur offene Kommentare ({kommentare.filter((k) => !k.erledigt).length})
        </label>
        <div className="grid gap-2">
          <Button disabled={!liste.length} onClick={() => herunterladen(`${datei}_Marker.edl`, alsEdl(titel, liste, o), 'text/plain')}>
            <Download className="h-4 w-4" /> DaVinci Resolve (.edl)
          </Button>
          <Button variant="secondary" disabled={!liste.length} onClick={() => herunterladen(`${datei}_Marker.xml`, alsFcpXml(titel, liste, o, dauerS), 'application/xml')}>
            <Download className="h-4 w-4" /> Premiere Pro (.xml)
          </Button>
          <Button variant="secondary" disabled={!liste.length} onClick={() => herunterladen(`${datei}_Kommentare.csv`, alsCsv(liste, o), 'text/csv')}>
            <Download className="h-4 w-4" /> Liste für Excel (.csv)
          </Button>
        </div>
        <p className="text-[12px] text-gray-500">
          Resolve: Timeline → rechte Maustaste → Timelines → Import → Timeline Markers from EDL. Premiere: Datei → Importieren → die XML wird eine Sequenz mit allen Markern; Marker
          markieren, kopieren und in deine Schnitt-Sequenz einfügen.
        </p>
      </div>
    </Modal>
  );
}
