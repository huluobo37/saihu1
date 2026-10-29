import { normalizeProductClassification } from './productClassification';
import type { AdsRecord, ImportBatch } from './types';

const record = (campaign: string, product: string | null): AdsRecord => ({ id: campaign, importId: 'batch-1', product, reportType: 'campaign', date: '2026-10-01', store: 'US3', campaign, adGroup: null, adType: null, status: null, spend: 1, sales: 2, orders: 1, impressions: 10, clicks: 1, dailyBudget: null, raw: {} });
const batch: ImportBatch = { id: 'batch-1', fingerprint: 'f', product: '未分类产品', fileName: '广告报表.xlsx', fileSize: 1, sheetName: 'Sheet1', importedAt: '2026-10-01', reportType: 'campaign', totalRows: 1, acceptedRows: 1, duplicateRows: 0, failedRows: 0, dateMin: '2026-10-01', dateMax: '2026-10-01', stores: ['US3'], headers: [] };

describe('product classification', () => {
  it('classifies unclassified SW and cupping campaigns as SW拔罐器', () => {
    const result = normalizeProductClassification([record('SW拔罐器核心词', null)], [batch]);
    expect(result.records[0]?.product).toBe('SW拔罐器');
    expect(result.imports[0]?.product).toBe('SW拔罐器');
    expect(result.changed).toBe(true);
  });
  it('does not overwrite an explicitly assigned product', () => {
    const result = normalizeProductClassification([record('SW拔罐器核心词', '其他产品')], [{ ...batch, product: '其他产品' }]);
    expect(result.records[0]?.product).toBe('其他产品');
    expect(result.changed).toBe(false);
  });
});
