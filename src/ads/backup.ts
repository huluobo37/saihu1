import type { AdsRecord, ImportBatch } from './types';

export interface BackupPayload {
  version: 1;
  exportedAt?: string;
  records: AdsRecord[];
  imports: ImportBatch[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNullableString = (value: unknown) => value === null || typeof value === 'string';
const isNullableNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value));

function isAdsRecord(value: unknown): value is AdsRecord {
  if (!isObject(value) || !isObject(value.raw)) return false;
  return typeof value.id === 'string' && typeof value.importId === 'string'
    && ['campaign', 'adGroup', 'searchTerm', 'placement', 'unknown'].includes(String(value.reportType))
    && ['date', 'store', 'campaign', 'adGroup', 'adType', 'status'].every((field) => isNullableString(value[field]))
    && ['spend', 'sales', 'orders', 'impressions', 'clicks', 'dailyBudget'].every((field) => isNullableNumber(value[field]));
}

function isImportBatch(value: unknown): value is ImportBatch {
  if (!isObject(value)) return false;
  return typeof value.id === 'string' && typeof value.fingerprint === 'string'
    && typeof value.fileName === 'string' && typeof value.sheetName === 'string'
    && typeof value.importedAt === 'string' && Array.isArray(value.headers) && Array.isArray(value.stores)
    && ['totalRows', 'acceptedRows', 'duplicateRows', 'failedRows', 'fileSize'].every((field) => typeof value[field] === 'number');
}

export function parseBackup(text: string): BackupPayload {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.records) || !Array.isArray(value.imports)) {
    throw new Error('备份文件格式无效或版本不受支持');
  }
  if (!value.records.every(isAdsRecord)) throw new Error('备份中的广告记录结构无效');
  if (!value.imports.every(isImportBatch)) throw new Error('备份中的导入批次结构无效');
  return value as unknown as BackupPayload;
}
