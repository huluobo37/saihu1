export type ReportType = 'campaign' | 'adGroup' | 'placement' | 'unknown';

export interface AdsRecord {
  id: string;
  importId: string;
  reportType: ReportType;
  date: string | null;
  store: string | null;
  campaign: string | null;
  adGroup: string | null;
  adType: string | null;
  status: string | null;
  spend: number | null;
  sales: number | null;
  orders: number | null;
  impressions: number | null;
  clicks: number | null;
  dailyBudget: number | null;
  raw: Record<string, unknown>;
}

export interface ImportBatch {
  id: string;
  fingerprint: string;
  fileName: string;
  fileSize: number;
  sheetName: string;
  importedAt: string;
  reportType: ReportType;
  totalRows: number;
  acceptedRows: number;
  duplicateRows: number;
  failedRows: number;
  dateMin: string | null;
  dateMax: string | null;
  stores: string[];
  headers: string[];
}

export interface MappingResult {
  source: string;
  target: 'date' | 'store' | 'campaign' | 'adGroup' | 'adType' | 'status' | 'spend' | 'sales' | 'orders' | 'impressions' | 'clicks' | 'dailyBudget' | null;
  status: 'matched' | 'unconfirmed';
}

export interface ImportPreview {
  batch: ImportBatch;
  records: AdsRecord[];
  mappings: MappingResult[];
  errors: string[];
  warnings: string[];
}

export interface Metrics {
  spend: number;
  sales: number;
  orders: number;
  impressions: number;
  clicks: number;
  acos: number | null;
  cpc: number | null;
  ctr: number | null;
  conversionRate: number | null;
  roas: number | null;
  costPerOrder: number | null;
}
