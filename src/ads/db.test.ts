import 'fake-indexeddb/auto';

import type { AdsRecord } from './types';
import { getSetting, setSetting, uniqueBusinessKey } from './db';

describe('business uniqueness', () => {
  it('separates report grains and matches repeated campaign rows', () => {
    const base = { id: 'a', importId: 'one', product: 'SW拔罐器', reportType: 'campaign', date: '2026-10-26', store: 'US8', campaign: 'C1', adGroup: null, adType: null, status: null, spend: 1, sales: 2, orders: 1, impressions: 10, clicks: 1, dailyBudget: null, raw: {} } satisfies AdsRecord;
    expect(uniqueBusinessKey(base)).toBe(uniqueBusinessKey({ ...base, id: 'b', importId: 'two' }));
    expect(uniqueBusinessKey(base)).not.toBe(uniqueBusinessKey({ ...base, reportType: 'adGroup', adGroup: 'G1' }));
  });
});

describe('IndexedDB settings', () => {
  it('persists global filters and mapping preferences', async () => {
    await setSetting('test-filter-setting', { store: 'US8', campaign: null });
    await expect(getSetting('test-filter-setting')).resolves.toEqual({ store: 'US8', campaign: null });
  });
});
