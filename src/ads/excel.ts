import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

import type { AdsRecord, ImportBatch, ImportPreview, MappingResult, ReportType } from './types';

export type MappingTarget = 'date' | 'store' | 'campaign' | 'adGroup' | 'adType' | 'status' | 'spend' | 'sales' | 'orders' | 'impressions' | 'clicks' | 'dailyBudget';
type Target = MappingTarget;

export const MAPPING_TARGET_OPTIONS: { value: MappingTarget; label: string }[] = [
  { value: 'date', label: '日期' }, { value: 'store', label: '店铺' },
  { value: 'campaign', label: '广告活动' }, { value: 'adGroup', label: '广告组' },
  { value: 'adType', label: '广告类型' }, { value: 'status', label: '广告状态' },
  { value: 'spend', label: '广告花费' }, { value: 'sales', label: '广告销售额' },
  { value: 'orders', label: '广告订单量' }, { value: 'impressions', label: '广告曝光量' },
  { value: 'clicks', label: '广告点击量' }, { value: 'dailyBudget', label: '每日预算' },
];

const ALIASES: Partial<Record<Target, string[]>> = {
  date: ['日期', '时间', '统计日期', '报告日期', 'date'],
  store: ['店铺名称', '店铺', '站点店铺', 'store'],
  campaign: ['广告活动', '广告活动名称', 'campaign name', 'campaign'],
  adGroup: ['广告组', '广告组名称', 'ad group name', 'ad group'],
  adType: ['广告类型', '投放类型', 'campaign type', '广告活动类型'],
  status: ['有效状态', '广告状态', '状态', 'status', '活动状态'],
  spend: ['广告花费', '花费', '支出', 'spend', 'cost'],
  sales: ['广告销售额', '销售额', '7天广告销售额', '14天广告销售额', 'sales'],
  orders: ['广告订单量', '订单量', '7天广告订单量', '14天广告订单量', 'orders'],
  impressions: ['广告曝光量', '曝光量', '展示量', 'impressions'],
  clicks: ['广告点击量', '点击量', 'clicks'],
  dailyBudget: ['每日预算', '日预算', 'daily budget'],
};

const normalized = (value: string) => value.trim().toLowerCase().replace(/[\s_()（）【】\-]/g, '');

export function mapHeaders(headers: string[]): MappingResult[] {
  return headers.map((source) => {
    const key = normalized(source);
    const target = (Object.entries(ALIASES) as [Target, string[]][]).find(([, aliases]) =>
      aliases.some((alias) => normalized(alias) === key),
    )?.[0] ?? null;
    return { source, target, status: target ? 'matched' : 'unconfirmed' };
  });
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const clean = String(value).trim().replace(/[$¥€£,\s]/g, '').replace(/%$/, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return dayjs(value).format('YYYY-MM-DD');
  if (typeof value === 'number') {
    const parts = XLSX.SSF.parse_date_code(value);
    return parts ? dayjs(`${parts.y}-${parts.m}-${parts.d}`).format('YYYY-MM-DD') : null;
  }
  const text = String(value).trim().replace(/[./]/g, '-');
  const parsed = dayjs(text);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

function inferReportType(mappings: MappingResult[]): ReportType {
  const targets = new Set(mappings.map((m) => m.target));
  if (targets.has('adGroup')) return 'adGroup';
  if (targets.has('campaign')) return 'campaign';
  return 'unknown';
}

function valueFor(row: Record<string, unknown>, mappings: MappingResult[], target: Target) {
  const source = mappings.find((m) => m.target === target)?.source;
  return source ? row[source] : null;
}

function recordsFromRows(
  rawRows: Record<string, unknown>[], mappings: MappingResult[], fingerprint: string, importId: string, product: string,
) {
  const reportType = inferReportType(mappings);
  const errors: string[] = [];
  const records = rawRows.map((raw, index): AdsRecord => {
    const date = parseDate(valueFor(raw, mappings, 'date'));
    const campaign = valueFor(raw, mappings, 'campaign');
    if (!date) errors.push(`第 ${index + 2} 行缺少或无法识别日期`);
    if (reportType === 'campaign' && !campaign) errors.push(`第 ${index + 2} 行缺少广告活动名称`);
    return {
      id: `${fingerprint}:${index + 2}`, importId, product, reportType, date,
      store: String(valueFor(raw, mappings, 'store') ?? '').trim() || null,
      campaign: String(campaign ?? '').trim() || null,
      adGroup: String(valueFor(raw, mappings, 'adGroup') ?? '').trim() || null,
      adType: String(valueFor(raw, mappings, 'adType') ?? '').trim() || null,
      status: String(valueFor(raw, mappings, 'status') ?? '').trim() || null,
      spend: parseNumber(valueFor(raw, mappings, 'spend')),
      sales: parseNumber(valueFor(raw, mappings, 'sales')),
      orders: parseNumber(valueFor(raw, mappings, 'orders')),
      impressions: parseNumber(valueFor(raw, mappings, 'impressions')),
      clicks: parseNumber(valueFor(raw, mappings, 'clicks')),
      dailyBudget: parseNumber(valueFor(raw, mappings, 'dailyBudget')),
      raw,
    };
  });
  return { records, reportType, errors };
}

function previewMetadata(records: AdsRecord[], fileName: string, reportType: ReportType) {
  const dates = records.map((record) => record.date).filter((value): value is string => Boolean(value)).sort();
  const stores = [...new Set(records.map((record) => record.store).filter((value): value is string => Boolean(value)))];
  const warnings: string[] = [];
  const fileStoreHint = fileName.match(/(US\d+)/i)?.[1]?.toUpperCase();
  if (fileStoreHint && stores.length && !stores.includes(fileStoreHint)) {
    warnings.push(`文件名中的店铺 ${fileStoreHint} 与表内店铺 ${stores.join('、')} 不一致，请核对数据归属；系统不会修改原始店铺名称。`);
  }
  if (reportType === 'unknown') warnings.push('未识别到广告活动或广告组字段，请确认字段映射。');
  return { dates, stores, warnings };
}

export function remapPreview(preview: ImportPreview, mappings: MappingResult[]): ImportPreview {
  const normalizedMappings = mappings.map((mapping) => ({ ...mapping, status: mapping.target ? 'matched' as const : 'unconfirmed' as const }));
  const rawRows = preview.records.map((record) => record.raw);
  const { records, reportType, errors } = recordsFromRows(rawRows, normalizedMappings, preview.batch.fingerprint, preview.batch.id, preview.batch.product);
  const { dates, stores, warnings } = previewMetadata(records, preview.batch.fileName, reportType);
  return {
    ...preview,
    mappings: normalizedMappings,
    records,
    errors,
    warnings,
    batch: {
      ...preview.batch, reportType, stores, failedRows: errors.length,
      acceptedRows: records.length, dateMin: dates[0] ?? null, dateMax: dates.at(-1) ?? null,
    },
  };
}

export async function parseExcel(file: File, product: string): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel 文件中没有可读取的工作表');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('无法读取第一个工作表');
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  const headers = rawRows.length ? Object.keys(rawRows[0]!) : [];
  const mappings = mapHeaders(headers);
  const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  const importId = crypto.randomUUID();
  const normalizedProduct = product.trim();
  if (!normalizedProduct) throw new Error('请先选择或输入产品名称');
  const { records, reportType, errors } = recordsFromRows(rawRows, mappings, fingerprint, importId, normalizedProduct);
  const { dates, stores, warnings } = previewMetadata(records, file.name, reportType);
  const batch: ImportBatch = {
    id: importId, fingerprint, product: normalizedProduct, fileName: file.name, fileSize: file.size, sheetName,
    importedAt: new Date().toISOString(), reportType, totalRows: rawRows.length,
    acceptedRows: records.length, duplicateRows: 0, failedRows: errors.length,
    dateMin: dates[0] ?? null, dateMax: dates.at(-1) ?? null, stores, headers,
  };
  return { batch, records, mappings, errors, warnings };
}
