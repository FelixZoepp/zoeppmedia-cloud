import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/freigaben', () => ({ istFreigegeben: vi.fn() }));
import { aufgabenText, problemVon } from '../upsell-waechter';
import { zielStatusFuer } from '../protokolle';
import { UPSELL_PIPELINE_ID, UPSELL_STATUS, istBestandskunde } from '../pipelines';

describe('Upsell-Wächter', () => {
  it('ohne nächsten Schritt / zu lange ohne Bewegung', () => {
    expect(problemVon({ naechsterSchritt: null, tageOhneBewegung: 0 })).toBe('kein_schritt');
    expect(problemVon({ naechsterSchritt: 'Termin 22.10.2026', tageOhneBewegung: 6 })).toBe('steht');
    expect(problemVon({ naechsterSchritt: 'Termin 22.10.2026', tageOhneBewegung: 2 })).toBeNull();
  });
  it('Aufgabentext', () => {
    expect(aufgabenText('B&C Direct Sales', 104000)).toBe('🔁 Upsell B&C Direct Sales (104.000 €): nächsten Schritt festlegen – Termin legen oder Aufgabe mit Datum');
  });
});

describe('Pipelines', () => {
  it('Bestandskunde am Lead-Status', () => {
    expect(istBestandskunde('Kunde')).toBe(true);
    expect(istBestandskunde(' Ex-Kunde ')).toBe(true);
    expect(istBestandskunde('Closing')).toBe(false);
    expect(istBestandskunde(null)).toBe(false);
  });
  it('D2D-Status wird für Upsell-Deals übersetzt, sonst unverändert', () => {
    const d2d = { pipeline_id: 'pipe_5E14qCHzi8u3cHk0bB44ky' };
    const up = { pipeline_id: UPSELL_PIPELINE_ID };
    const GEWONNEN = 'stat_BFVJiIlomolS2JMTSHc49cHnvh2Rl1IuWnudLEYRh0n';
    const VERLOREN = 'stat_843j170eWlP742evQCGjL4BRdczZY4hGTTiV7s0LVZe';
    const NO_SHOW = 'stat_mOm4p6MGvO3A6dnmolp5G3l0TWM7v9fOjlJBkaNUlRG';
    expect(zielStatusFuer(d2d, GEWONNEN)).toBe(GEWONNEN);
    expect(zielStatusFuer(up, GEWONNEN)).toBe(UPSELL_STATUS.gewonnen);
    expect(zielStatusFuer(up, VERLOREN)).toBe(UPSELL_STATUS.verloren);
    expect(zielStatusFuer(up, NO_SHOW)).toBeNull();
  });
});
