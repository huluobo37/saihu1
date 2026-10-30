import { calculateMetrics, groupRecords } from './metrics';
import type { AdsRecord, Metrics } from './types';

export type TrendMetric = keyof Pick<Metrics, 'spend' | 'sales' | 'orders' | 'impressions' | 'clicks' | 'acos' | 'cpc' | 'ctr' | 'conversionRate' | 'roas'>;
export type MovingAverageWindow = 3 | 5 | 7 | 14;
export type TrendPoint = { name: string; records: AdsRecord[] } & Metrics & Partial<Record<`${TrendMetric}Ma${MovingAverageWindow}`, number | null>>;

export const MOVING_AVERAGE_COLORS: Record<MovingAverageWindow, string> = {
  3: '#56B4E9',
  5: '#0072B2',
  7: '#D55E00',
  14: '#009E73',
};

export function strictMovingAverage(values: (number | null)[], window: MovingAverageWindow) {
  return values.map((_, index) => {
    if (index + 1 < window) return null;
    const slice = values.slice(index + 1 - window, index + 1);
    if (slice.some((value) => value === null)) return null;
    return slice.reduce<number>((sum, value) => sum + (value ?? 0), 0) / window;
  });
}

export function buildTrendData(rows: AdsRecord[]): TrendPoint[] {
  const datedRows = rows.filter((row): row is AdsRecord & { date: string } => Boolean(row.date));
  const availableDates = [...new Set(datedRows.map((row) => row.date))].sort();
  let points: TrendPoint[];
  if (availableDates.length) {
    const recordsByDate = new Map<string, AdsRecord[]>();
    for (const row of datedRows) recordsByDate.set(row.date, [...(recordsByDate.get(row.date) ?? []), row]);
    const dates: string[] = [];
    const current = new Date(`${availableDates[0]}T00:00:00Z`);
    const end = new Date(`${availableDates.at(-1)}T00:00:00Z`);
    while (current <= end) { dates.push(current.toISOString().slice(0, 10)); current.setUTCDate(current.getUTCDate() + 1); }
    points = dates.map((name) => {
      const records = recordsByDate.get(name) ?? [];
      return { name, records, ...calculateMetrics(records) } as TrendPoint;
    });
  } else {
    points = groupRecords(rows, () => '未知日期') as TrendPoint[];
  }
  const metrics: TrendMetric[] = ['spend', 'sales', 'orders', 'impressions', 'clicks', 'acos', 'cpc', 'ctr', 'conversionRate', 'roas'];
  const windows: MovingAverageWindow[] = [3, 5, 7, 14];
  for (const metric of metrics) {
    const values = points.map((point) => point[metric]);
    for (const window of windows) {
      const averages = strictMovingAverage(values, window);
      points.forEach((point, index) => { point[`${metric}Ma${window}`] = averages[index]; });
    }
  }
  return points;
}
