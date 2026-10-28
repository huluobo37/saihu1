import { openDB } from 'idb';

import type { AdsRecord, ImportBatch } from './types';

const DB_NAME = 'amazon-ads-analytics';
const DB_VERSION = 1;

const db = () => openDB(DB_NAME, DB_VERSION, {
  upgrade(database) {
    const records = database.createObjectStore('records', { keyPath: 'id' });
    records.createIndex('by-import', 'importId');
    database.createObjectStore('imports', { keyPath: 'id' });
    database.createObjectStore('settings', { keyPath: 'key' });
  },
});

export async function loadAll() {
  const database = await db();
  return {
    records: await database.getAll('records') as AdsRecord[],
    imports: await database.getAll('imports') as ImportBatch[],
  };
}

export async function saveImport(batch: ImportBatch, records: AdsRecord[]) {
  const database = await db();
  const existing = await database.getAll('records') as AdsRecord[];
  const keys = new Set(existing.map(uniqueBusinessKey));
  const accepted = records.filter((record) => {
    const key = uniqueBusinessKey(record);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  const duplicateRows = records.length - accepted.length;
  const savedBatch = { ...batch, acceptedRows: accepted.length, duplicateRows };
  const tx = database.transaction(['records', 'imports'], 'readwrite');
  await Promise.all([tx.objectStore('imports').put(savedBatch), ...accepted.map((row) => tx.objectStore('records').put(row))]);
  await tx.done;
  return savedBatch;
}

export function uniqueBusinessKey(row: AdsRecord) {
  return [row.product, row.reportType, row.store, row.date, row.campaign, row.adGroup, row.portfolio, row.placement, row.searchTerm, row.target, row.matchType].map((v) => v ?? '').join('|');
}

export async function deleteImport(importId: string) {
  const database = await db();
  const tx = database.transaction(['records', 'imports'], 'readwrite');
  const index = tx.objectStore('records').index('by-import');
  for (const key of await index.getAllKeys(importId)) await tx.objectStore('records').delete(key);
  await tx.objectStore('imports').delete(importId);
  await tx.done;
}

export async function replaceAll(records: AdsRecord[], imports: ImportBatch[]) {
  const database = await db();
  const tx = database.transaction(['records', 'imports'], 'readwrite');
  await tx.objectStore('records').clear();
  await tx.objectStore('imports').clear();
  for (const row of records) await tx.objectStore('records').put(row);
  for (const batch of imports) await tx.objectStore('imports').put(batch);
  await tx.done;
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const database = await db();
  const row = await database.get('settings', key) as { key: string; value: T } | undefined;
  return row?.value ?? null;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const database = await db();
  await database.put('settings', { key, value });
}
