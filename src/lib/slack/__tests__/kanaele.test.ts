import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { kanalNachName } from '../kanaele';

const kanaele = [
  { id: 'C1', name: '03-sales' },
  { id: 'C2', name: '05-marketing' },
  { id: 'C3', name: '04-fulfillment' },
  { id: 'C4', name: 'wins' },
  { id: 'C5', name: 'system-alarme' },
];

describe('kanalNachName', () => {
  it('findet Kanäle am Namen', () => {
    expect(kanalNachName('sales', kanaele)).toBe('C1');
    expect(kanalNachName('fulfillment', kanaele)).toBe('C3');
    expect(kanalNachName('wins', kanaele)).toBe('C4');
    expect(kanalNachName('system', kanaele)).toBe('C5');
  });
  it('ohne passenden Kanal null', () => {
    expect(kanalNachName('wins', kanaele.slice(0, 2))).toBeNull();
    expect(kanalNachName('system', [])).toBeNull();
  });
});
