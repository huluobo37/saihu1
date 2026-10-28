import { buildTrendData, strictMovingAverage } from './chartData';
import type { AdsRecord } from './types';

const row = (date: string, spend: number): AdsRecord => ({ id: date, importId: 'batch', product: 'SW拔罐器', reportType: 'campaign', date, store: 'US8', campaign: 'A', adGroup: null, adType: null, status: null, spend, sales: spend * 2, orders: 1, impressions: 100, clicks: 10, dailyBudget: null, raw: {} });

describe('trend chart data', () => {
  it('calculates strict trailing averages without pretending incomplete windows are complete', () => {
    expect(strictMovingAverage([1, 2, 3, 4, 5, 6], 5)).toEqual([null, null, null, null, 3, 4]);
    expect(strictMovingAverage([1, 2, null, 4, 5], 5)).toEqual([null, null, null, null, null]);
  });
  it('groups by date and adds moving-average fields', () => {
    const data = buildTrendData(['01', '02', '03', '04', '05'].map((day, index) => row(`2026-10-${day}`, index + 1)));
    expect(data).toHaveLength(5);
    expect(data[4]?.spendMa5).toBe(3);
    expect(data[4]?.impressionsMa5).toBe(100);
    expect(data[4]?.clicksMa5).toBe(10);
    expect(data[4]?.spendMa10).toBeNull();
  });
  it('keeps every calendar day on the x-axis when a report date is missing', () => {
    const data = buildTrendData([row('2026-10-01', 10), row('2026-10-03', 30)]);
    expect(data.map((point) => point.name)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(data[1]?.records).toHaveLength(0);
    expect(data[1]?.spend).toBe(0);
    expect(data[1]?.ctr).toBeNull();
  });
});
