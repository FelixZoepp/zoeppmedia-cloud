import { describe, expect, it } from 'vitest';
import { leseFunnelLead } from '../funnel-lead';

describe('leseFunnelLead', () => {
  it('liest das Perspective-Format inkl. UTM aus meta und Antworten mit Titel', () => {
    const l = leseFunnelLead({
      id: 'abc',
      funnelName: 'Recruiting-Funnel',
      meta: { url: 'https://funnel.example/?utm_source=ig&utm_medium=paid&utm_campaign=123456789' },
      profile: {
        firstName: { value: 'Rudi', title: 'Vorname' },
        lastName: { value: 'Muigg', title: 'Nachname' },
        email: { value: 'rudi@example.at', title: 'E-Mail' },
        phone: { value: '+43 676 1234567', title: 'Telefon' },
        problem: { value: 'Zu wenig Bewerbungen', title: 'Was ist aktuell dein größtes Problem?' },
      },
    });
    expect(l.name).toBe('Rudi Muigg');
    expect(l.email).toBe('rudi@example.at');
    expect(l.phone).toBe('+43 676 1234567');
    expect(l.funnelName).toBe('Recruiting-Funnel');
    expect(l.utm).toEqual({ source: 'ig', medium: 'paid', campaign: '123456789', content: null });
    expect(l.antworten).toEqual([{ frage: 'Was ist aktuell dein größtes Problem?', antwort: 'Zu wenig Bewerbungen' }]);
  });

  it('akzeptiert flache Bodies und UTM aus der Webhook-URL', () => {
    const l = leseFunnelLead({ name: 'Max Muster', email: 'max@example.de', utm_source: 'fb' }, new URLSearchParams('utm_medium=paid'));
    expect(l.name).toBe('Max Muster');
    expect(l.utm.source).toBe('fb');
    expect(l.utm.medium).toBe('paid');
    expect(l.antworten).toEqual([]);
  });
});
