import { describe, expect, it } from 'vitest';
import { erzwungeneFrage, fuerWhatsApp } from '../whatsapp';

describe('erzwungeneFrage', () => {
  it('erkennt „Assistent: …“', () => {
    expect(erzwungeneFrage('Assistent: wie war gestern?')).toBe('wie war gestern?');
    expect(erzwungeneFrage('zoepp, Quoten diese Woche')).toBe('Quoten diese Woche');
    expect(erzwungeneFrage('Ja passt mir')).toBeNull();
  });
});

describe('fuerWhatsApp', () => {
  it('wandelt Markdown in WhatsApp-Format', () => {
    expect(fuerWhatsApp('**Show-up 72 %**\n- Settings: 9\n- [Vertrieb](/admin/vertrieb)')).toEqual(['*Show-up 72 %*\n• Settings: 9\n• Vertrieb (cloud.zoeppmedia.de/admin/vertrieb)']);
  });
  it('teilt lange Antworten', () => {
    const teile = fuerWhatsApp(Array.from({ length: 300 }, (_, i) => `Zeile ${i} mit etwas Text`).join('\n'));
    expect(teile.length).toBeGreaterThan(1);
    expect(teile.every((t) => t.length <= 4000)).toBe(true);
  });
});
