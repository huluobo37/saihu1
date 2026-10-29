import type { AdsRecord, ImportBatch } from './types';

const isUnclassified = (value: string | null | undefined) => !value || value === '未分类产品' || value === '未分类';

export function isSwCuppingRecord(record: AdsRecord) {
  const text = [record.campaign, record.adGroup, record.portfolio, record.target, record.searchTerm].filter(Boolean).join(' ');
  return /拔罐|(^|[^a-z])sw([^a-z]|$)/i.test(text);
}

export function normalizeProductClassification(records: AdsRecord[], imports: ImportBatch[]) {
  const swImportIds = new Set<string>();
  let changed = false;
  const normalizedRecords = records.map((record) => {
    if (!isUnclassified(record.product) || !isSwCuppingRecord(record)) return record;
    swImportIds.add(record.importId); changed = true;
    return { ...record, product: 'SW拔罐器' };
  });
  const normalizedImports = imports.map((batch) => {
    if (!isUnclassified(batch.product) || (!swImportIds.has(batch.id) && !/拔罐|(^|[^a-z])sw([^a-z]|$)/i.test(batch.fileName))) return batch;
    changed = true;
    return { ...batch, product: 'SW拔罐器' };
  });
  return { records: normalizedRecords, imports: normalizedImports, changed };
}
