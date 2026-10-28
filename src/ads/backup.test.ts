import { parseBackup } from './backup';

const valid = {
  version: 1,
  records: [{ id: 'row', importId: 'batch', reportType: 'campaign', date: '2026-10-26', store: 'US8', campaign: 'A', adGroup: null, adType: null, status: null, spend: 1, sales: 2, orders: 1, impressions: 10, clicks: 1, dailyBudget: null, raw: { 日期: '2026-10-26' } }],
  imports: [{ id: 'batch', fingerprint: 'fingerprint', fileName: 'report.xlsx', fileSize: 1, sheetName: 'sheet', importedAt: '2026-10-28T00:00:00.000Z', reportType: 'campaign', totalRows: 1, acceptedRows: 1, duplicateRows: 0, failedRows: 0, dateMin: '2026-10-26', dateMax: '2026-10-26', stores: ['US8'], headers: ['日期'] }],
};

describe('backup validation', () => {
  it('accepts a structurally valid backup', () => {
    expect(parseBackup(JSON.stringify(valid))).toMatchObject({ version: 1, records: [{ id: 'row' }] });
  });
  it('rejects malformed JSON and invalid records before replacing local data', () => {
    expect(() => parseBackup('{')).toThrow('不是有效的 JSON');
    expect(() => parseBackup(JSON.stringify({ ...valid, records: [{ id: 'broken' }] }))).toThrow('广告记录结构无效');
  });
});
