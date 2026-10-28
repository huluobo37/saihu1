import type { SupabaseClient, User } from '@supabase/supabase-js';
import { mergeBy, syncWithClient } from './supabase';
import type { ImportBatch } from './types';

describe('cloud merge behavior', () => {
  it('keeps local-only and remote-only values while remote wins conflicts', () => {
    const local = [{ id: 'local', value: 1 }, { id: 'shared', value: 1 }];
    const remote = [{ id: 'remote', value: 2 }, { id: 'shared', value: 3 }];
    expect(mergeBy(local, remote, (item) => item.id)).toEqual([
      { id: 'local', value: 1 }, { id: 'shared', value: 3 }, { id: 'remote', value: 2 },
    ]);
  });
  it('surfaces upload failures without mutating the caller data', async () => {
    const imports: ImportBatch[] = [{ id: 'batch', fingerprint: 'fingerprint', fileName: 'report.xlsx', fileSize: 1, sheetName: 'sheet', importedAt: '2026-10-28T00:00:00.000Z', reportType: 'campaign', totalRows: 1, acceptedRows: 1, duplicateRows: 0, failedRows: 0, dateMin: '2026-10-26', dateMax: '2026-10-26', stores: ['US8'], headers: ['日期'] }];
    const client = { from: () => ({ upsert: async () => ({ error: { message: 'network unavailable' } }) }) } as unknown as SupabaseClient;
    await expect(syncWithClient(client, { id: 'user' } as User, [], imports)).rejects.toThrow('导入批次上传失败：network unavailable');
    expect(imports).toHaveLength(1);
  });
});
