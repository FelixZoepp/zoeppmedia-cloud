import { describe, expect, it } from 'vitest';
import { EINGETRAGEN_VIEW, NEUE_SETTER_VIEWS } from '../close-smartviews';

describe('Setter-Listen in Close', () => {
  it('zwei neue Listen mit Telefon-Pflicht und Sperre', () => {
    expect(NEUE_SETTER_VIEWS.map((v) => v.name)).toEqual(['👻 2.3 (QC) Verloren (Ghosting) – nach 30 Tagen nochmal', '🧊 3.4 (CC) Alte Leads reaktivieren']);
    for (const v of NEUE_SETTER_VIEWS) {
      const text = JSON.stringify(v.s_query);
      expect(text).toContain('num_phone_numbers');
      expect(text).toContain('"offset"');
    }
    expect(JSON.stringify(NEUE_SETTER_VIEWS[0].s_query)).toContain('Nicht mehr erreichbar (Ghosting)');
  });
  it('3.1 schließt die frischen, nie angerufenen Leads aus 3.0 aus', () => {
    const text = JSON.stringify(EINGETRAGEN_VIEW.s_query);
    expect(text).toContain('"negate":true');
    expect(text).toContain('num_outgoing_calls');
  });
});
