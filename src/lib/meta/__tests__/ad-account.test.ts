import { describe, expect, it } from 'vitest';
import { normalisiereAdAccount } from '../ad-account';

describe('normalisiereAdAccount', () => {
  it('ergänzt act_ und lässt vorhandenes stehen', () => {
    expect(normalisiereAdAccount('773153438539782')).toBe('act_773153438539782');
    expect(normalisiereAdAccount(' act_773153438539782 ')).toBe('act_773153438539782');
    expect(normalisiereAdAccount('')).toBeUndefined();
    expect(normalisiereAdAccount(undefined)).toBeUndefined();
  });
});
