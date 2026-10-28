import { groupRecords } from './metrics';
import type { AdsRecord, Metrics } from './types';

export type TrendMetric = keyof Pick<Metrics, 'spend' | 'sales' | 'orders' | 'impressions' | 'clicks' | 'acos' | 'cpc' | 'ctr' | 'conversionRate' | 'roas'>;
export type MovingAverageWindow = 5 | 10 | 30;
export type TrendPoint = { name: string; records: AdsRecord[] } & Metrics & Partial<Record<`${TrendMetric}Ma${MovingAverageWindow}`, number | null>>;

export const MOVING_AVERAGE_COLORS: Record<MovingAverageWindow, string> = {
  5: '#0072B2',
  10: '#D55E00',
  30: '#009E73',
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
  const points = groupRecords(rows, (row) => row.date ?? '未知日期')
    .sort((a, b) => a.name.localeCompare(b.name)) as TrendPoint[];
  const metrics: TrendMetric[] = ['spend', 'sales', 'orders', 'impressions', 'clicks', 'acos', 'cpc', 'ctr', 'conversionRate', 'roas'];
  const windows: MovingAverageWindow[] = [5, 10, 30];
  for (const metric of metrics) {
    const values = points.map((point) => point[metric]);
    for (const window of windows) {
      const averages = strictMovingAverage(values, window);
      points.forEach((point, index) => { point[`${metric}Ma${window}`] = averages[index]; });
    }
  }
  return points;
}
