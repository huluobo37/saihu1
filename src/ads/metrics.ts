import type { AdsRecord, Metrics } from './types';

const sum = (rows: AdsRecord[], field: 'spend' | 'sales' | 'orders' | 'impressions' | 'clicks') =>
  rows.reduce((total, row) => total + (row[field] ?? 0), 0);

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;

export function calculateMetrics(rows: AdsRecord[]): Metrics {
  const spend = sum(rows, 'spend');
  const sales = sum(rows, 'sales');
  const orders = sum(rows, 'orders');
  const impressions = sum(rows, 'impressions');
  const clicks = sum(rows, 'clicks');
  return {
    spend,
    sales,
    orders,
    impressions,
    clicks,
    acos: ratio(spend, sales),
    cpc: ratio(spend, clicks),
    ctr: ratio(clicks, impressions),
    conversionRate: ratio(orders, clicks),
    roas: ratio(sales, spend),
    costPerOrder: ratio(spend, orders),
  };
}

export function groupRecords(rows: AdsRecord[], key: (row: AdsRecord) => string) {
  const groups = new Map<string, AdsRecord[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return [...groups.entries()].map(([name, records]) => ({ name, records, ...calculateMetrics(records) }));
}
