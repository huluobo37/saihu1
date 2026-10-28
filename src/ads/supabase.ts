import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

import type { AdsRecord, ImportBatch } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && publishableKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!url || !publishableKey) return null;
  client ??= createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function subscribeToAuth(callback: (session: Session | null) => void) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase 尚未配置');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase 尚未配置');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export interface SyncResult {
  records: AdsRecord[];
  imports: ImportBatch[];
  pushedRecords: number;
  pushedImports: number;
  pulledRecords: number;
  pulledImports: number;
}

interface CloudRecordRow { payload: AdsRecord }
interface CloudImportRow { payload: ImportBatch }

export const mergeBy = <T>(local: T[], remote: T[], key: (value: T) => string) => {
  const result = new Map<string, T>();
  for (const value of [...local, ...remote]) result.set(key(value), value);
  return [...result.values()];
};

export async function syncWithClient(
  supabase: SupabaseClient,
  user: User,
  records: AdsRecord[],
  imports: ImportBatch[],
): Promise<SyncResult> {
  const importRows = imports.map((batch) => ({
    id: `${user.id}:${batch.fingerprint}`,
    user_id: user.id,
    fingerprint: batch.fingerprint,
    file_name: batch.fileName,
    imported_at: batch.importedAt,
    payload: batch,
  }));
  const recordRows = records.map((record) => ({
    id: `${user.id}:${record.id}`,
    user_id: user.id,
    import_id: `${user.id}:${record.importId}`,
    report_type: record.reportType,
    record_date: record.date,
    store: record.store,
    campaign: record.campaign,
    ad_group: record.adGroup,
    payload: record,
  }));

  if (importRows.length) {
    const { error } = await supabase.from('import_batches').upsert(importRows, { onConflict: 'id' });
    if (error) throw new Error(`导入批次上传失败：${error.message}`);
  }
  if (recordRows.length) {
    const { error } = await supabase.from('ads_records').upsert(recordRows, { onConflict: 'id' });
    if (error) throw new Error(`广告记录上传失败：${error.message}`);
  }

  const [cloudImports, cloudRecords] = await Promise.all([
    supabase.from('import_batches').select('payload').order('imported_at', { ascending: true }),
    supabase.from('ads_records').select('payload'),
  ]);
  if (cloudImports.error) throw new Error(`导入批次下载失败：${cloudImports.error.message}`);
  if (cloudRecords.error) throw new Error(`广告记录下载失败：${cloudRecords.error.message}`);

  const remoteImports = (cloudImports.data as CloudImportRow[]).map((row) => row.payload);
  const remoteRecords = (cloudRecords.data as CloudRecordRow[]).map((row) => row.payload);
  return {
    imports: mergeBy(imports, remoteImports, (batch) => batch.fingerprint),
    records: mergeBy(records, remoteRecords, (record) => record.id),
    pushedImports: importRows.length,
    pushedRecords: recordRows.length,
    pulledImports: remoteImports.length,
    pulledRecords: remoteRecords.length,
  };
}

export async function syncWithSupabase(
  user: User,
  records: AdsRecord[],
  imports: ImportBatch[],
): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase 尚未配置');
  return syncWithClient(supabase, user, records, imports);
}
