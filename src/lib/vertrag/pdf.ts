import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { vertragZeilen, type VertragDaten } from './daten';

export interface Bestaetigung {
  unterzeichner_name: string;
  bestaetigt_am: string; // ISO
  ip: string;
  daten_hash: string;
  agb_url: string | null;
}

/** Standard-Schrift kann nur WinAnsi – alles andere (Emojis, fremde Schriften) ersetzen */
function sauber(text: string): string {
  return text.replace(/[^ -~ -ÿ€„“”‚‘’–—…]/g, '?');
}

function umbrechen(text: string, font: PDFFont, size: number, breite: number): string[] {
  const zeilen: string[] = [];
  let aktuell = '';
  for (const wort of sauber(text).split(/\s+/)) {
    const versuch = aktuell ? `${aktuell} ${wort}` : wort;
    if (font.widthOfTextAtSize(versuch, size) > breite && aktuell) {
      zeilen.push(aktuell);
      aktuell = wort;
    } else {
      aktuell = versuch;
    }
  }
  if (aktuell) zeilen.push(aktuell);
  return zeilen;
}

const zeitDe = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr';

/** Vertragsbestätigung als PDF (A4) */
export async function erzeugeBestaetigungPdf(daten: VertragDaten, b: Bestaetigung): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Vertragsbestätigung ${daten.firma}`);
  pdf.setAuthor('Zoepp Media');
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const grau = rgb(0.4, 0.4, 0.4);
  const links = 56;
  const breite = 595.28 - 2 * links;
  let y = 780;

  const text = (t: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; w?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const f = opts.f ?? font;
    for (const z of umbrechen(t, f, size, opts.w ?? breite)) {
      page.drawText(z, { x: opts.x ?? links, y, size, font: f, color: opts.color });
      y -= size * 1.45;
    }
  };

  text('ZOEPP MEDIA', { size: 9, f: fett, color: rgb(0.88, 0.21, 0.29) });
  y -= 4;
  text('Vertragsbestätigung', { size: 20, f: fett });
  y -= 6;
  text('Die folgenden Eckdaten der Zusammenarbeit wurden in der Zoepp Media Cloud elektronisch bestätigt.', { color: grau });
  y -= 10;

  for (const [label, wert] of vertragZeilen(daten)) {
    page.drawText(sauber(label), { x: links, y, size: 10.5, font: fett });
    text(wert, { x: links + 150, w: breite - 150 });
    y -= 4;
  }

  y -= 10;
  text(
    b.agb_url
      ? `Es gelten die Vertragsbedingungen/AGB von Zoepp Media: ${b.agb_url}`
      : 'Es gelten die Allgemeinen Geschäftsbedingungen von Zoepp Media.',
  );
  y -= 14;
  text('Bestätigung', { size: 12, f: fett });
  text(`Bestätigt von: ${b.unterzeichner_name}`);
  text(`Zeitpunkt: ${zeitDe(b.bestaetigt_am)}`);
  text(`IP-Adresse: ${b.ip}`);
  y -= 6;
  text(`Prüfsumme der Vertragsdaten (SHA-256): ${b.daten_hash}`, { size: 8, color: grau });

  return pdf.save();
}
