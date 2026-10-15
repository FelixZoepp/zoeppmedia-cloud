import { describe, expect, it } from 'vitest';
import { inviteTemplate, startSchritte } from '../templates';

describe('Einladungs-Mail', () => {
  it('Inhaber bekommt die volle „So startest du“-Liste', () => {
    const html = inviteTemplate('Muster GmbH', 'https://x/register/abc', '01.01.2027', 'inhaber');
    expect(html).toContain('So startest du');
    expect(startSchritte('inhaber')).toHaveLength(5);
    for (const s of startSchritte('inhaber')) expect(html).toContain(s);
    expect(html).toContain('Einstellungen → WhatsApp');
    expect(html).toContain('Anruf-Modus');
  });

  it('Team-Mitglieder: nur Konto anlegen + anrufen', () => {
    const html = inviteTemplate('Muster GmbH', 'https://x/register/abc', '01.01.2027', 'team');
    expect(startSchritte('team')).toHaveLength(2);
    expect(html).toContain('So startest du');
    expect(html).not.toContain('Onboarding-Formular');
  });

  it('ohne Anleitung (interne Mitarbeiter) bleibt die Mail wie bisher', () => {
    const html = inviteTemplate('Zoepp Media Team', 'https://x/register/abc', '01.01.2027');
    expect(html).not.toContain('So startest du');
    expect(html).toContain('https://x/register/abc');
  });
});
