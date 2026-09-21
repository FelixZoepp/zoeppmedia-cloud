/**
 * Tests für src/lib/bot/prompt.ts
 * Phase 3 Task 3 — Systemprompt-Builder.
 */

import { describe, it, expect } from 'vitest';
import {
  PROMPT_VERSION,
  buildSystemBlocks,
  buildTurnMessages,
  type PromptContext,
} from '../prompt';

// -------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------

const baseCtx: PromptContext = {
  agencyName: 'Solar Direkt GmbH',
  job: {
    title: 'Außendienstmitarbeiter Solar',
    description: 'Wir suchen engagierte Verkäufer für unsere Solarprodukte.',
    location: 'München',
  },
  config: {
    persona: 'Lena',
    tone: 'freundlich und professionell',
    formality: 'du',
    language: 'de',
    allowed_languages: ['de', 'en'],
    faq: [
      { q: 'Wie hoch ist die Provision?', a: '200 € pro Abschluss' },
      { q: 'Wird ein Führerschein benötigt?', a: 'Ja, Klasse B.' },
    ],
    intro_text: null,
  },
  questions: [
    {
      key: 'fuehrerschein',
      text: 'Hast du einen Führerschein Klasse B?',
      type: 'yes_no',
      options: null,
      required: true,
      status: 'offen',
    },
    {
      key: 'starttermin',
      text: 'Ab wann kannst du starten?',
      type: 'date',
      options: null,
      required: true,
      status: 'beantwortet',
    },
    {
      key: 'schicht',
      text: 'Welches Schichtmodell passt dir?',
      type: 'choice',
      options: ['Früh', 'Spät', 'Nacht'],
      required: false,
      status: 'übersprungen',
    },
  ],
  currentQuestionKey: 'fuehrerschein',
};

// -------------------------------------------------------------------
// PROMPT_VERSION
// -------------------------------------------------------------------

describe('PROMPT_VERSION', () => {
  it('P0: ist "v1"', () => {
    expect(PROMPT_VERSION).toBe('v1');
  });
});

// -------------------------------------------------------------------
// buildSystemBlocks — Struktur
// -------------------------------------------------------------------

describe('buildSystemBlocks — Struktur', () => {
  it('P1: liefert genau 5 Blöcke', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks).toHaveLength(5);
  });

  it('P2: Blöcke 0–2 haben cache: true', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[0].cache).toBe(true);
    expect(blocks[1].cache).toBe(true);
    expect(blocks[2].cache).toBe(true);
  });

  it('P3: Blöcke 3–4 haben KEIN cache-Flag (undefined oder false)', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[3].cache).toBeFalsy();
    expect(blocks[4].cache).toBeFalsy();
  });
});

// -------------------------------------------------------------------
// Block 0 — Rolle
// -------------------------------------------------------------------

describe('Block 0 — Rolle', () => {
  it('P4: enthält die Persona', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[0].text).toContain('Lena');
  });

  it('P5: enthält Tonalität', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[0].text).toContain('freundlich und professionell');
  });

  it('P6: enthält "Du-Form" bei formality "du"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[0].text).toContain('Du-Form');
  });

  it('P7: enthält "Sie-Form" bei formality "sie"', () => {
    const ctx: PromptContext = {
      ...baseCtx,
      config: { ...baseCtx.config, formality: 'sie' },
    };
    const blocks = buildSystemBlocks(ctx);
    expect(blocks[0].text).toContain('Sie-Form');
  });

  it('P8: enthält Hinweis auf digitalen Assistenten und menschliche Übernahme', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[0].text.toLowerCase()).toContain('assistent');
    // Hinweis: Mensch kann übernehmen
    expect(blocks[0].text.toLowerCase()).toMatch(/mensch|übernehmen|übernimmt/);
  });
});

// -------------------------------------------------------------------
// Block 1 — Aufgabe
// -------------------------------------------------------------------

describe('Block 1 — Aufgabe', () => {
  it('P9: enthält den Jobtitel', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[1].text).toContain('Außendienstmitarbeiter Solar');
  });

  it('P10: enthält "nur Vorqualifizierung" oder "Vorqualifizierung"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[1].text.toLowerCase()).toContain('vorqualifizierung');
  });
});

// -------------------------------------------------------------------
// Block 2 — Job-Kontext / FAQ
// -------------------------------------------------------------------

describe('Block 2 — Job-Kontext', () => {
  it('P11: enthält FAQ-Einträge im Format "F: … / A: …"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[2].text).toContain('F: Wie hoch ist die Provision?');
    expect(blocks[2].text).toContain('A: 200 € pro Abschluss');
  });

  it('P12: enthält den Standort', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[2].text).toContain('München');
  });
});

// -------------------------------------------------------------------
// Block 3 — Fragenliste
// -------------------------------------------------------------------

describe('Block 3 — Fragenliste', () => {
  it('P13: listet alle Fragen mit Status im Format "- [status] key (type...): text"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    // offen
    expect(blocks[3].text).toContain('[offen]');
    expect(blocks[3].text).toContain('fuehrerschein');
    // beantwortet
    expect(blocks[3].text).toContain('[beantwortet]');
    expect(blocks[3].text).toContain('starttermin');
    // übersprungen
    expect(blocks[3].text).toContain('[übersprungen]');
    expect(blocks[3].text).toContain('schicht');
  });

  it('P14: enthält Optionen bei choice-Fragen', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[3].text).toContain('Früh');
    expect(blocks[3].text).toContain('Spät');
    expect(blocks[3].text).toContain('Nacht');
  });

  it('P15: enthält "Aktuelle Frage: fuehrerschein"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[3].text).toContain('fuehrerschein');
    expect(blocks[3].text.toLowerCase()).toContain('aktuelle frage');
  });

  it('P16: bei currentQuestionKey null steht "keine" oder "alle beantwortet"', () => {
    const ctx: PromptContext = { ...baseCtx, currentQuestionKey: null };
    const blocks = buildSystemBlocks(ctx);
    expect(blocks[3].text.toLowerCase()).toMatch(/keine|alle beantwortet/);
  });
});

// -------------------------------------------------------------------
// Block 4 — Guardrails
// -------------------------------------------------------------------

describe('Block 4 — Guardrails', () => {
  it('P17: enthält verbotene Themen wörtlich aufgezählt', () => {
    const blocks = buildSystemBlocks(baseCtx);
    // Einige der verbotenen Themen
    expect(blocks[4].text.toLowerCase()).toMatch(/alter|geburtsdatum/);
    expect(blocks[4].text.toLowerCase()).toMatch(/herkunft|nationalität/);
    expect(blocks[4].text.toLowerCase()).toMatch(/religion/);
    expect(blocks[4].text.toLowerCase()).toMatch(/gesundheit|krankheit/);
    expect(blocks[4].text.toLowerCase()).toMatch(/schwanger/);
    expect(blocks[4].text.toLowerCase()).toMatch(/familienplanung|kinderwunsch/);
    expect(blocks[4].text.toLowerCase()).toMatch(/behinderung/);
    expect(blocks[4].text.toLowerCase()).toMatch(/gewerkschaft/);
    expect(blocks[4].text.toLowerCase()).toMatch(/sexuelle orientierung/);
  });

  it('P18: enthält den Satz über Eingaben als Daten, keine Anweisungen', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[4].text.toLowerCase()).toMatch(/eingaben|daten|anweisungen|anweisung/);
  });

  it('P19: enthält "höchstens 3 Sätze"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[4].text).toContain('3 Sätze');
  });

  it('P20: enthält "eine Frage pro Nachricht"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[4].text.toLowerCase()).toContain('eine frage pro nachricht');
  });

  it('P21: enthält "nur JSON" oder "ausschließlich JSON"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[4].text.toLowerCase()).toMatch(/nur json|ausschließlich.*json|json.*schema/);
  });

  it('P22: enthält "keine Entscheidung mitteilen"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[4].text.toLowerCase()).toContain('entscheidung');
  });

  it('P23: enthält Hinweis "keine Zusagen, keine Absagen, keine Gehaltsverhandlung, keine Rechtsauskunft"', () => {
    const blocks = buildSystemBlocks(baseCtx);
    const text = blocks[4].text.toLowerCase();
    expect(text).toMatch(/zusagen/);
    expect(text).toMatch(/absagen/);
    expect(text).toMatch(/gehaltsverhandlung/);
    expect(text).toMatch(/rechtsauskunft/);
  });

  it('P24: enthält "Das kläre ich mit dem Team" bei unbekannter Jobfrage', () => {
    const blocks = buildSystemBlocks(baseCtx);
    expect(blocks[4].text).toContain('Das kläre ich mit dem Team');
  });

  it('P25: enthält JSON-Schema-Beschreibung mit dem Beispielobjekt', () => {
    const blocks = buildSystemBlocks(baseCtx);
    // Das Beispielobjekt enthält intent, answers, reply_text etc.
    expect(blocks[4].text).toContain('intent');
    expect(blocks[4].text).toContain('reply_text');
    expect(blocks[4].text).toContain('handover');
  });
});

// -------------------------------------------------------------------
// privacyUrl — Datenschutz-Hinweis in Block 0
// -------------------------------------------------------------------

describe('Block 0 — Datenschutz-Hinweis', () => {
  it('PV1: mit privacyUrl gesetzt enthält Block 0 die URL und den Hinweis', () => {
    const ctx: PromptContext = {
      ...baseCtx,
      privacyUrl: 'https://example.com/datenschutz',
    };
    const blocks = buildSystemBlocks(ctx);
    expect(blocks[0].text).toContain('https://example.com/datenschutz');
    expect(blocks[0].text.toLowerCase()).toContain('datenschutzerklärung');
  });

  it('PV2: ohne privacyUrl (undefined) enthält Block 0 keinen Datenschutz-Hinweis', () => {
    const ctx: PromptContext = { ...baseCtx };
    // privacyUrl nicht gesetzt
    delete (ctx as Partial<PromptContext>).privacyUrl;
    const blocks = buildSystemBlocks(ctx);
    expect(blocks[0].text).not.toContain('Datenschutzerklärung');
    expect(blocks[0].text).not.toContain('datenschutz.example.com');
  });

  it('PV3: mit privacyUrl=null enthält Block 0 keinen Datenschutz-Hinweis', () => {
    const ctx: PromptContext = { ...baseCtx, privacyUrl: null };
    const blocks = buildSystemBlocks(ctx);
    expect(blocks[0].text).not.toContain('Datenschutzerklärung');
  });
});

// -------------------------------------------------------------------
// buildTurnMessages
// -------------------------------------------------------------------

describe('buildTurnMessages', () => {
  it('T1: direction "in" wird zu role "user"', () => {
    const msgs = buildTurnMessages(
      [{ direction: 'in', body: 'Hallo' }],
      [],
    );
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('Hallo');
  });

  it('T2: direction "out" wird zu role "assistant"', () => {
    const msgs = buildTurnMessages(
      [{ direction: 'out', body: 'Wie kann ich helfen?' }],
      [],
    );
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].content).toBe('Wie kann ich helfen?');
  });

  it('T3: neue Inbound-Texte werden als letzte user-Message angehängt (mit \\n verbunden)', () => {
    const msgs = buildTurnMessages(
      [{ direction: 'out', body: 'Erste Frage?' }],
      ['Antwort A', 'Antwort B'],
    );
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toBe('Antwort A\nAntwort B');
  });

  it('T4: leere History, ein Inbound → genau eine user-Message', () => {
    const msgs = buildTurnMessages([], ['Hallo!']);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ role: 'user', content: 'Hallo!' });
  });

  it('T5: leere History, leere Inbound → leeres Array', () => {
    const msgs = buildTurnMessages([], []);
    expect(msgs).toHaveLength(0);
  });

  it('T6: Reihenfolge bleibt erhalten — alternierend in/out', () => {
    const history = [
      { direction: 'in' as const, body: 'Msg 1' },
      { direction: 'out' as const, body: 'Msg 2' },
      { direction: 'in' as const, body: 'Msg 3' },
    ];
    const msgs = buildTurnMessages(history, []);
    expect(msgs[0]).toEqual({ role: 'user', content: 'Msg 1' });
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'Msg 2' });
    expect(msgs[2]).toEqual({ role: 'user', content: 'Msg 3' });
  });

  it('T7: ein Inbound ohne History → user-Message mit verbundenen Texten', () => {
    const msgs = buildTurnMessages([], ['Teil 1', 'Teil 2', 'Teil 3']);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('Teil 1\nTeil 2\nTeil 3');
  });
});
