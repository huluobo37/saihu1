import { App } from 'antd';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { deleteImport, getSetting, loadAll, replaceAll, saveImport, setSetting } from './db';
import { parseBackup } from './backup';
import type { AdsRecord, ImportBatch, ImportPreview } from './types';

interface Filters { dateRange: [string, string] | null; product: string | null; store: string | null; campaign: string | null; adType: string | null; status: string | null }
interface AdsState {
  records: AdsRecord[]; imports: ImportBatch[]; filtered: AdsRecord[]; loading: boolean;
  preview: ImportPreview | null; setPreview: (value: ImportPreview | null) => void;
  filters: Filters; setFilters: (value: Filters) => void;
  commitPreview: () => Promise<void>; removeImport: (id: string) => Promise<void>;
  exportBackup: () => void; restoreBackup: (file: File) => Promise<void>;
  reloadData: () => Promise<void>;
}

const initialFilters: Filters = { dateRange: null, product: null, store: null, campaign: null, adType: null, status: null };
const Context = createContext<AdsState | null>(null);

export function AdsProvider({ children }: { children: ReactNode }) {
  const { message } = App.useApp();
  const [records, setRecords] = useState<AdsRecord[]>([]);
  const [imports, setImports] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const data = await loadAll(); setRecords(data.records); setImports(data.imports); setLoading(false);
  }, []);
  useEffect(() => {
    void Promise.all([refresh(), getSetting<Filters>('global-filters')]).then(([, savedFilters]) => {
      if (savedFilters) setFilters({ ...initialFilters, ...savedFilters });
      setFiltersLoaded(true);
    });
  }, [refresh]);
  useEffect(() => { if (filtersLoaded) void setSetting('global-filters', filters); }, [filters, filtersLoaded]);

  const filtered = useMemo(() => records.filter((row) => {
    if (filters.dateRange && (!row.date || row.date < filters.dateRange[0] || row.date > filters.dateRange[1])) return false;
    return (!filters.product || (row.product ?? '未分类产品') === filters.product)
      && (!filters.store || row.store === filters.store) && (!filters.campaign || row.campaign === filters.campaign)
      && (!filters.adType || row.adType === filters.adType) && (!filters.status || row.status === filters.status);
  }), [records, filters]);

  const commitPreview = async () => {
    if (!preview) return;
    const batch = await saveImport(preview.batch, preview.records);
    await setSetting('mapping-rules', Object.fromEntries(preview.mappings.filter((mapping) => mapping.target).map((mapping) => [mapping.source, mapping.target])));
    await refresh(); setPreview(null);
    message.success(`已导入 ${batch.acceptedRows} 条记录，跳过 ${batch.duplicateRows} 条重复记录`);
  };
  const removeImport = async (id: string) => { await deleteImport(id); await refresh(); message.success('导入批次及其记录已删除'); };
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records, imports }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `amazon-ads-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const restoreBackup = async (file: File) => {
    const parsed = parseBackup(await file.text());
    await replaceAll(parsed.records, parsed.imports); await refresh(); message.success('本地备份已恢复');
  };

  return <Context.Provider value={{ records, imports, filtered, loading, preview, setPreview, filters, setFilters, commitPreview, removeImport, exportBackup, restoreBackup, reloadData: refresh }}>{children}</Context.Provider>;
}

export function useAds() {
  const value = useContext(Context); if (!value) throw new Error('useAds must be used inside AdsProvider'); return value;
}
