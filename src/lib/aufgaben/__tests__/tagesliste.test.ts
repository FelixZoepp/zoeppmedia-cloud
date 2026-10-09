import { describe, expect, it } from 'vitest';
import { einzeilig, istListenBefehl, leseErledigt, listenText, sortiere } from '../tagesliste';

describe('leseErledigt', () => {
  it('erkennt einzelne und mehrere Nummern', () => {
    expect(leseErledigt('erledigt 2')).toEqual([2]);
    expect(leseErledigt('Erledigt 1 3')).toEqual([1, 3]);
    expect(leseErledigt('erledigt 1, 3 und 4')).toEqual([1, 3, 4]);
    expect(leseErledigt('done 2!')).toEqual([2]);
    expect(leseErledigt('erledigt: 5')).toEqual([5]);
  });
  it('ignoriert normalen Text', () => {
    expect(leseErledigt('erledigt')).toBeNull();
    expect(leseErledigt('ist das erledigt 2 mal?')).toBeNull();
    expect(leseErledigt('Hallo, das Video ist erledigt')).toBeNull();
    expect(leseErledigt('erledigt 0')).toBeNull();
  });
});

describe('Listen', () => {
  const heute = '2026-10-09';
  it('einzeilig entfernt Umbrüche und kürzt', () => {
    expect(einzeilig('a\nb\t  c')).toBe('a b c');
    expect(einzeilig('x'.repeat(80), 10)).toHaveLength(10);
  });
  it('sortiert überfällige zuerst, dann nach Priorität', () => {
    const s = sortiere([
      { id: 'a', title: 'A', due_date: heute, priority: 'low' },
      { id: 'b', title: 'B', due_date: '2026-10-01', priority: 'low' },
      { id: 'c', title: 'C', due_date: heute, priority: 'urgent' },
    ]);
    expect(s.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('baut eine einzeilige nummerierte Liste', () => {
    const t = listenText(
      [
        { id: 'b', title: 'Ad schneiden', due_date: '2026-10-01', priority: 'high' },
        { id: 'a', title: 'Reports\nraus', due_date: heute, priority: 'low' },
      ],
      heute,
      5,
    );
    expect(t).toBe('1) Ad schneiden (überfällig) · 2) Reports raus · und 3 weitere im Board');
    expect(t).not.toMatch(/\n/);
  });
  it('erkennt den Listen-Befehl', () => {
    expect(istListenBefehl('Liste')).toBe(true);
    expect(istListenBefehl('meine aufgaben?')).toBe(true);
    expect(istListenBefehl('liste bitte die Kunden')).toBe(false);
  });
});
