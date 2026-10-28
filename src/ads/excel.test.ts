import { mapHeaders, parseDate, parseNumber, remapPreview } from './excel';
import type { ImportPreview } from './types';

describe('Excel normalization', () => {
  it('maps known fields and leaves unknown fields unconfirmed', () => {
    const mapped = mapHeaders(['日期', '店铺名称', '广告活动', '广告花费', '自定义字段']);
    expect(mapped.map((item) => item.target)).toEqual(['date', 'store', 'campaign', 'spend', null]);
    expect(mapped.at(-1)?.status).toBe('unconfirmed');
  });
  it('parses amounts, percentages and empty cells', () => {
    expect(parseNumber('1,234.50')).toBe(1234.5); expect(parseNumber('29.08%')).toBe(29.08); expect(parseNumber('')).toBeNull(); expect(parseNumber(null)).toBeNull();
  });
  it('parses text and Excel serial dates', () => { expect(parseDate('2026/10/26')).toBe('2026-10-26'); expect(parseDate(46391)).toMatch(/^2027-/); });
  it('rebuilds records and report metadata after a manual mapping change', () => {
    const preview = {
      batch: { id: 'batch', fingerprint: 'file:1:1', product: 'SW拔罐器', fileName: 'US3-report.xlsx', fileSize: 1, sheetName: 'sheet', importedAt: '2026-10-28T00:00:00.000Z', reportType: 'unknown', totalRows: 1, acceptedRows: 1, duplicateRows: 0, failedRows: 1, dateMin: null, dateMax: null, stores: [], headers: ['统计日', '店铺列', '活动列', '费用列'] },
      records: [{ id: 'file:1:1:2', importId: 'batch', product: 'SW拔罐器', reportType: 'unknown', date: null, store: null, campaign: null, adGroup: null, adType: null, status: null, spend: null, sales: null, orders: null, impressions: null, clicks: null, dailyBudget: null, raw: { 统计日: '2026/10/26', 店铺列: 'US8', 活动列: 'Campaign A', 费用列: '12.50' } }],
      mappings: mapHeaders(['统计日', '店铺列', '活动列', '费用列']), errors: [], warnings: [],
    } satisfies ImportPreview;
    const mappings = preview.mappings.map((mapping) => ({ ...mapping, target: ({ 统计日: 'date', 店铺列: 'store', 活动列: 'campaign', 费用列: 'spend' } as const)[mapping.source as '统计日' | '店铺列' | '活动列' | '费用列'], status: 'matched' as const }));
    const remapped = remapPreview(preview, mappings);
    expect(remapped.batch.reportType).toBe('campaign');
    expect(remapped.batch.dateMin).toBe('2026-10-26');
    expect(remapped.batch.stores).toEqual(['US8']);
    expect(remapped.records[0]).toMatchObject({ date: '2026-10-26', store: 'US8', campaign: 'Campaign A', spend: 12.5 });
    expect(remapped.records[0]?.product).toBe('SW拔罐器');
    expect(remapped.warnings[0]).toContain('US3');
  });
});
