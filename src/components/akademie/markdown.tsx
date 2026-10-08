import type { ReactNode } from 'react';

/**
 * Kleiner, sicherer Markdown-Renderer für Akademie-Artikel (nur Text, kein HTML):
 * Überschriften ##/###, Listen -, nummerierte Listen, Zitate >, Tabellen |, **fett**.
 */

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((teil, i) =>
    teil.startsWith('**') && teil.endsWith('**') ? <strong key={i}>{teil.slice(2, -2)}</strong> : <span key={i}>{teil}</span>,
  );
}

export function Markdown({ text }: { text: string }) {
  const zeilen = text.replace(/\r/g, '').split('\n');
  const bloecke: ReactNode[] = [];
  let i = 0;
  while (i < zeilen.length) {
    const z = zeilen[i];
    if (!z.trim()) {
      i++;
      continue;
    }
    if (z.startsWith('### ')) {
      bloecke.push(<h4 key={i} className="mt-5 text-[15px] font-semibold">{inline(z.slice(4))}</h4>);
      i++;
    } else if (z.startsWith('## ')) {
      bloecke.push(<h3 key={i} className="mt-6 text-[17px] font-semibold tracking-[-0.01em]">{inline(z.slice(3))}</h3>);
      i++;
    } else if (z.startsWith('> ')) {
      const teile: string[] = [];
      while (i < zeilen.length && zeilen[i].startsWith('> ')) teile.push(zeilen[i++].slice(2));
      bloecke.push(
        <blockquote key={i} className="mt-3 rounded-[10px] border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-[14px] text-amber-900">
          {teile.map((t, j) => <p key={j}>{inline(t)}</p>)}
        </blockquote>,
      );
    } else if (z.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < zeilen.length && zeilen[i].trim().startsWith('|')) {
        const cells = zeilen[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [kopf, ...rest] = rows;
      bloecke.push(
        <div key={i} className="mt-3 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead><tr>{kopf?.map((c, j) => <th key={j} className="border-b border-[var(--hair)] px-2 py-1.5 text-left font-semibold">{inline(c)}</th>)}</tr></thead>
            <tbody>{rest.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border-b border-[var(--hair)] px-2 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (/^\s*[-*] /.test(z)) {
      const items: string[] = [];
      while (i < zeilen.length && /^\s*[-*] /.test(zeilen[i])) items.push(zeilen[i++].replace(/^\s*[-*] /, ''));
      bloecke.push(<ul key={i} className="mt-2 list-disc space-y-1 pl-5 text-[15px]">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
    } else if (/^\s*\d+[.)] /.test(z)) {
      const items: string[] = [];
      while (i < zeilen.length && /^\s*\d+[.)] /.test(zeilen[i])) items.push(zeilen[i++].replace(/^\s*\d+[.)] /, ''));
      bloecke.push(<ol key={i} className="mt-2 list-decimal space-y-1 pl-5 text-[15px]">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>);
    } else {
      bloecke.push(<p key={i} className="mt-2 text-[15px] leading-relaxed">{inline(z)}</p>);
      i++;
    }
  }
  return <div>{bloecke}</div>;
}
