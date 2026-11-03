import { describe, expect, it } from 'vitest';
import { leseFunnelLead, ohneFirmenname, zielFeld } from '../funnel-lead';

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
    expect(l.utm).toMatchObject({ source: 'ig', medium: 'paid', campaign: '123456789', content: null });
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

describe('Firmenname (Report-Funnel „Name des Vertriebs“)', () => {
  it('liest company_name als Firma, Person bleibt Name', () => {
    const l = leseFunnelLead({
      funnelName: 'Vertriebs Report - Leadmagnet - 300k',
      profile: {
        name: { title: 'Name', value: 'Felix Zoepp' },
        email: { title: 'E-Mail', value: 'felix@example.de' },
        phone: { title: 'WhatsApp-Nummer', value: '015202159031' },
        company_name: { title: 'Name des Vertriebs', value: 'Zoepp Consulting GmbH' },
      },
    });
    expect(l.name).toBe('Felix Zoepp');
    expect(l.firma).toBe('Zoepp Consulting GmbH');
    expect(l.phone).toBe('015202159031');
  });

  it('erkennt Leads ohne Firmennamen', () => {
    expect(ohneFirmenname('Felix Zoepp', ['Felix Zoepp'])).toBe(true);
    expect(ohneFirmenname('felix@example.de', [])).toBe(true);
    expect(ohneFirmenname('+49 152 02159031', [])).toBe(true);
    expect(ohneFirmenname('', [])).toBe(true);
    expect(ohneFirmenname('Zoepp Consulting GmbH', ['Felix Zoepp'])).toBe(false);
  });
});

describe('UTM-Platzhalter', () => {
  it('überspringt Feldbeschriftungen wie „UTM Content“', async () => {
    const { leseFunnelLead } = await import('../funnel-lead');
    const l = leseFunnelLead({ email: 'a@b.de', felder: { utm_content: 'UTM Content' }, meta: { utm_content: '250propartner' } }, new URLSearchParams());
    expect(l.utm.content).toBe('250propartner');
  });
});

describe('zielFeld', () => {
  it('ordnet abweichende und neue Funnel-Fragen festen Close-Feldern zu', () => {
    expect(zielFeld('Warum ist es dir wichtig neue Vertriebler zu gewinnen?')).toEqual({ name: 'Warum ist es dir wichtig, neue Vertriebler zu gewinnen?', anlegen: true });
    expect(zielFeld('Wie viele Vertriebler möchtest du pro Monat onboarden?').name).toBe('Wie viele Vertriebler möchtest du in den nächsten 30 Tagen einstellen?');
    expect(zielFeld('Worüber kommen deine Vertriebler aktuell?').name).toBe('Wie gewinnst du aktuell Vertriebler?');
    expect(zielFeld('Wie viele Vertriebler hast du aktuell?').anlegen).toBe(true);
  });
  it('andere Fragen nur bei gleichem Namen, ohne Anlegen', () => {
    expect(zielFeld('Was ist aktuell dein größtes Problem?')).toEqual({ name: 'Was ist aktuell dein größtes Problem?', anlegen: false });
    expect(zielFeld('Fbclid').anlegen).toBe(false);
  });
});
