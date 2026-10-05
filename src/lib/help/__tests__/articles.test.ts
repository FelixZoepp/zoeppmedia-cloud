import { describe, it, expect } from 'vitest';
import { audienceFor, helpFor, shortcutsFor } from '../articles';

describe('Hilfe-Center', () => {
  it('ordnet Rollen Zielgruppen zu', () => {
    expect(audienceFor('admin')).toBe('admin');
    expect(audienceFor('employee')).toBe('team');
    expect(audienceFor('agency_owner')).toBe('kunde');
    expect(audienceFor('agency_viewer')).toBe('kunde');
  });

  it('jeder Artikel gehört zu einem Thema seiner Zielgruppe', () => {
    for (const a of ['kunde', 'team', 'admin'] as const) {
      const { topics, articles } = helpFor(a);
      const keys = new Set(topics.map((t) => t.key));
      for (const art of articles) expect(keys.has(art.topic), `${a}: ${art.frage}`).toBe(true);
      for (const t of topics) expect(articles.some((x) => x.topic === t.key), `${a}: ${t.key} leer`).toBe(true);
    }
  });

  it('Kunden sehen keine internen Seiten in Kürzeln', () => {
    const hrefs = shortcutsFor('kunde').map((s) => s.href).filter(Boolean);
    expect(hrefs).not.toContain('/meine-todos');
    expect(hrefs).not.toContain('/team');
  });

  it('G-Kürzel sind je Zielgruppe eindeutig', () => {
    for (const a of ['kunde', 'team', 'admin'] as const) {
      const g = shortcutsFor(a).filter((s) => s.keys[0] === 'G').map((s) => s.keys[1]);
      expect(new Set(g).size).toBe(g.length);
    }
  });
});
