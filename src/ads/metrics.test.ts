import { calculateMetrics } from './metrics';
import type { AdsRecord } from './types';

const row = (values: Partial<AdsRecord>): AdsRecord => ({ id: crypto.randomUUID(), importId: 'test', product: 'SW拔罐器', reportType: 'campaign', date: '2026-10-26', store: 'US8', campaign: 'test', adGroup: null, adType: null, status: null, spend: null, sales: null, orders: null, impressions: null, clicks: null, dailyBudget: null, raw: {}, ...values });

describe('calculateMetrics', () => {
  it('uses aggregate numerators and denominators', () => {
    const result = calculateMetrics([row({ spend: 40, sales: 200, orders: 2, clicks: 10, impressions: 1000 }), row({ spend: 60, sales: 100, orders: 3, clicks: 15, impressions: 500 })]);
    expect(result.acos).toBeCloseTo(1 / 3); expect(result.cpc).toBe(4); expect(result.ctr).toBeCloseTo(25 / 1500); expect(result.conversionRate).toBe(0.2); expect(result.roas).toBe(3);
  });
  it('returns null for zero denominators', () => {
    const result = calculateMetrics([row({ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 })]);
    expect(result.acos).toBeNull(); expect(result.cpc).toBeNull(); expect(result.ctr).toBeNull(); expect(result.conversionRate).toBeNull(); expect(result.roas).toBeNull();
  });
  it('keeps null source values from becoming artificial row values', () => { expect(calculateMetrics([row({})]).spend).toBe(0); });
});
