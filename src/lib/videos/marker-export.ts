/**
 * Kommentare als Marker für den Schnitt exportieren.
 * - EDL (CMX 3600 mit Marker-Zeilen): DaVinci Resolve → Timeline → Import → Timeline Markers from EDL
 * - FCP-XML: Premiere Pro → Datei → Importieren → Sequenz mit allen Markern (Marker lassen sich in die eigene Sequenz kopieren)
 * - CSV: Liste für Excel/Sheets
 */

export interface MarkerKommentar {
  zeit_s: number | null;
  zeit_bis_s?: number | null;
  text: string;
  autor: string;
  erledigt?: boolean;
}

export interface ExportOptionen {
  fps: number;
  /** Start-Timecode der Timeline in Sekunden (Resolve: meist 01:00:00:00 = 3600) */
  startS: number;
}

/** Sekunden → Timecode HH:MM:SS:FF (non-drop) */
export function timecode(s: number, fps: number): string {
  const frames = Math.round(s * fps);
  const ff = frames % fps;
  const gesamtS = Math.floor(frames / fps);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(gesamtS / 3600))}:${p(Math.floor((gesamtS % 3600) / 60))}:${p(gesamtS % 60)}:${p(ff)}`;
}

const einzeilig = (t: string) => t.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

function nurMitZeit(k: MarkerKommentar[]) {
  return k.filter((x) => x.zeit_s !== null).sort((a, b) => (a.zeit_s ?? 0) - (b.zeit_s ?? 0));
}

/** EDL mit Marker-Zeilen (|C: Farbe |M: Name |D: Dauer in Frames) – Format, das Resolve beim Marker-Export selbst schreibt */
export function alsEdl(titel: string, kommentare: MarkerKommentar[], o: ExportOptionen): string {
  const zeilen = [`TITLE: ${einzeilig(titel)}`, 'FCM: NON-DROP FRAME', ''];
  nurMitZeit(kommentare).forEach((k, i) => {
    const start = o.startS + (k.zeit_s ?? 0);
    const dauerFrames = Math.max(1, Math.round(((k.zeit_bis_s ?? k.zeit_s ?? 0) - (k.zeit_s ?? 0)) * o.fps) || 1);
    const ein = timecode(start, o.fps);
    const aus = timecode(start + 1 / o.fps, o.fps);
    zeilen.push(`${String(i + 1).padStart(3, '0')}  001      V     C        ${ein} ${aus} ${ein} ${aus}  `);
    zeilen.push(` |C:${k.erledigt ? 'ResolveColorGreen' : 'ResolveColorRed'} |M:${einzeilig(`${k.autor}: ${k.text}`).replace(/\|/g, '/')} |D:${dauerFrames}`);
    zeilen.push('');
  });
  return zeilen.join('\r\n');
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** FCP7-XML (xmeml) – Premiere importiert das als Sequenz mit Sequenz-Markern */
export function alsFcpXml(titel: string, kommentare: MarkerKommentar[], o: ExportOptionen, dauerS: number): string {
  const fps = Math.round(o.fps);
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const marker = nurMitZeit(kommentare)
    .map((k) => {
      const ein = Math.round((k.zeit_s ?? 0) * fps);
      const aus = k.zeit_bis_s ? Math.round(k.zeit_bis_s * fps) : -1;
      return `      <marker><name>${xml(einzeilig(k.text).slice(0, 60))}</name><comment>${xml(einzeilig(`${k.autor}: ${k.text}`))}</comment><in>${ein}</in><out>${aus}</out></marker>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>${xml(einzeilig(titel))} – Feedback</name>
    <duration>${Math.max(1, Math.round(dauerS * fps))}</duration>
    ${rate}
    <timecode>${rate}<string>${timecode(o.startS, fps)}</string><frame>${Math.round(o.startS * fps)}</frame><displayformat>NDF</displayformat></timecode>
    <media><video><format><samplecharacteristics>${rate}</samplecharacteristics></format><track/></video></media>
${marker}
  </sequence>
</xmeml>
`;
}

/** CSV (Semikolon, mit BOM für Excel) */
export function alsCsv(kommentare: MarkerKommentar[], o: ExportOptionen): string {
  const zelle = (t: string) => `"${t.replace(/"/g, '""')}"`;
  const kopf = ['Nr', 'Timecode', 'Bis', 'Autor', 'Kommentar', 'Status'].join(';');
  const zeilen = [...nurMitZeit(kommentare), ...kommentare.filter((k) => k.zeit_s === null)].map((k, i) =>
    [
      i + 1,
      k.zeit_s === null ? 'allgemein' : timecode(o.startS + k.zeit_s, o.fps),
      k.zeit_bis_s ? timecode(o.startS + k.zeit_bis_s, o.fps) : '',
      zelle(k.autor),
      zelle(einzeilig(k.text)),
      k.erledigt ? 'erledigt' : 'offen',
    ].join(';'),
  );
  return `﻿${[kopf, ...zeilen].join('\r\n')}`;
}
