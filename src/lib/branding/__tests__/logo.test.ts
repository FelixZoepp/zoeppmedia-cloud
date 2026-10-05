import { describe, it, expect } from 'vitest';
import { agencyLogo, isOwnStorageUrl } from '../logo';

describe('isOwnStorageUrl', () => {
  const base = 'https://abc.supabase.co';
  it('erlaubt nur den eigenen Bucket', () => {
    expect(isOwnStorageUrl(`${base}/storage/v1/object/public/onboarding-assets/avatars/a.png`, base)).toBe(true);
    expect(isOwnStorageUrl('https://evil.example/x.png', base)).toBe(false);
    expect(isOwnStorageUrl(`${base}/storage/v1/object/public/anderer/x.png`, base)).toBe(false);
  });
});

describe('agencyLogo', () => {
  it('liest logo_url aus settings', () => {
    expect(agencyLogo({ logo_url: 'u' })).toBe('u');
    expect(agencyLogo({})).toBeNull();
    expect(agencyLogo(null)).toBeNull();
  });
});
