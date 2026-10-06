import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { mappeKandidat, mappeWebhook, pruefeSignatur } from '../mapping';

const webhook = {
  event: 'candidate.completed',
  data: {
    candidate: { id: 'p1', name: 'Anna', email: 'a@b.de', external_id: 'cand-123' },
    scores: {
      overall: 78.4,
      fit: { key: 'gut', label: 'Gute Passung' },
      archetype: { key: 'jaeger', name: 'Der Jäger', subtitle: 'Abschlussstark' },
      dimensionScores: [{ key: 'drive', name: 'Antrieb', score: 82 }, { key: 'x' }],
      warnings: ['Ungeduld', { label: 'Regelbruch' }],
    },
    reportUrl: 'https://12personatypen.de/r/abc',
  },
  timestamp: '2026-10-06T12:00:00Z',
};

describe('Persona-Mapping', () => {
  it('Webhook → Bewerber-Felder', () => {
    const r = mappeWebhook(webhook);
    expect(r).toMatchObject({ event: 'candidate.completed', externeId: 'cand-123', personaId: 'p1' });
    expect(r.ergebnis).toEqual({
      persona_status: 'abgeschlossen',
      persona_typ: 'Der Jäger',
      persona_typ_key: 'jaeger',
      persona_fit: 'Gute Passung',
      persona_score: 78,
      persona_warnungen: ['Ungeduld', 'Regelbruch'],
      persona_dimensionen: [{ key: 'drive', name: 'Antrieb', score: 82 }],
      persona_report_url: 'https://12personatypen.de/r/abc',
      persona_abgeschlossen_am: '2026-10-06T12:00:00Z',
    });
  });
  it('API-Kandidat: offen und begonnen ohne Abschlussdatum', () => {
    expect(mappeKandidat({ status: 'offen', scores: null }).persona_status).toBe('eingeladen');
    expect(mappeKandidat({ status: 'begonnen', completed_at: '2026-10-06' }).persona_abgeschlossen_am).toBeNull();
    const fertig = mappeKandidat({ status: 'abgeschlossen', completed_at: '2026-10-06T10:00:00Z', scores: { overall: 60, dimension_scores: [{ key: 'a', name: 'A', score: 50 }] } });
    expect(fertig).toMatchObject({ persona_status: 'abgeschlossen', persona_score: 60, persona_abgeschlossen_am: '2026-10-06T10:00:00Z' });
    expect(fertig.persona_dimensionen).toHaveLength(1);
  });
  it('Signatur prüfen', () => {
    const body = JSON.stringify(webhook);
    const sig = 'sha256=' + createHmac('sha256', 'geheim').update(body).digest('hex');
    expect(pruefeSignatur(body, sig, 'geheim')).toBe(true);
    expect(pruefeSignatur(body, sig, 'falsch')).toBe(false);
    expect(pruefeSignatur(body, null, 'geheim')).toBe(false);
    expect(pruefeSignatur(body + ' ', sig, 'geheim')).toBe(false);
  });
});
