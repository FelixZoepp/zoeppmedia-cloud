import { describe, expect, it } from 'vitest';
import { zoomZiel } from '../zoom-link';

describe('zoomZiel', () => {
  it('gibt den Zoom-Link zurück', () => {
    expect(zoomZiel({ location: 'https://us06web.zoom.us/j/860?pwd=abc.1', status: 'scheduled' })).toBe('https://us06web.zoom.us/j/860?pwd=abc.1');
  });
  it('nichts bei Absage, Telefonnummer oder fremder Domain', () => {
    expect(zoomZiel({ location: 'https://us06web.zoom.us/j/860', status: 'cancelled' })).toBeNull();
    expect(zoomZiel({ location: '+49 170 1234567', status: 'scheduled' })).toBeNull();
    expect(zoomZiel({ location: 'https://zoom.us.evil.de/j/1', status: 'scheduled' })).toBeNull();
    expect(zoomZiel(null)).toBeNull();
  });
});
