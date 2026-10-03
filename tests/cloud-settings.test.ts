import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { CloudSettingsSync, SettingsSyncError, type CloudSettingsRepository, type CloudSettingsRecord } from '../src/application/settings/cloud-settings';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculatorSettingsRepository } from '../src/infrastructure/storage/dexie-calculator-settings-repository';
import { DexieDocumentSettingsRepository } from '../src/infrastructure/storage/dexie-document-settings-repository';
import { copyCalculatorSettings, createDefaultCalculatorSettings, type CalculatorSettings } from '../src/domain/configuration/calculator-settings';
import { decodeDocumentSettingsCache } from '../src/application/settings/document-settings-cache';
import { createSettingsSnapshot } from '../src/application/settings/calculator-settings';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { input } from './fixtures';
import { pack } from './order-fixtures';
import { ownedKey } from '../src/infrastructure/storage/local-ownership';

function setup(localValue = { rate: 10 }, record: CloudSettingsRecord<{ rate: number }> | null = null) {
  const events: string[] = [];
  const cache = { load: vi.fn(async () => structuredClone(localValue)), save: vi.fn(async () => { events.push('cache'); }) };
  const cloud: CloudSettingsRepository<{ rate: number }> = {
    load: vi.fn(async () => record),
    create: vi.fn(async (value) => { events.push('cloud'); return { userId: 'A', revision: 1, value }; }),
    update: vi.fn(async (value, revision) => { events.push('cloud'); return { userId: 'A', revision: revision + 1, value }; }),
  };
  let online = true;
  const sync = new CloudSettingsSync('A', cache, cloud, (v) => structuredClone(v), () => online);
  return { sync, cache, cloud, events, offline: () => { online = false; } };
}
it('first login uploads user-owned local settings when cloud is empty', async () => {
  const s = setup(); expect(await s.sync.reload()).toEqual({ rate: 10 });
  expect(s.cloud.create).toHaveBeenCalledWith({ rate: 10 });
});
it('cloud wins over stale cache', async () => {
  const s = setup({ rate: 10 }, { userId: 'A', revision: 3, value: { rate: 20 } });
  expect(await s.sync.reload()).toEqual({ rate: 20 }); expect(s.cloud.create).not.toHaveBeenCalled();
});
it('missing local settings use repository defaults and upload them', async () => {
  const s = setup({ rate: 0 }); await s.sync.reload(); expect(s.cloud.create).toHaveBeenCalledWith({ rate: 0 });
});
it('saves cloud before cache against the edited revision', async () => {
  const s = setup(); await s.sync.reload(); s.events.length = 0;
  await s.sync.save({ rate: 30 }); expect(s.events).toEqual(['cloud', 'cache']);
  expect(s.cloud.update).toHaveBeenCalledWith({ rate: 30 }, 1);
});
it.each(['settings_changed_elsewhere', 'cloud_unavailable'] as const)('does not update cache on %s', async (code) => {
  const s = setup(); await s.sync.reload(); s.cache.save.mockClear();
  vi.mocked(s.cloud.update).mockRejectedValue(new SettingsSyncError(code));
  await expect(s.sync.save({ rate: 30 })).rejects.toMatchObject({ code }); expect(s.cache.save).not.toHaveBeenCalled();
});
it('rejects another user record before touching cache', async () => {
  const s = setup(undefined, { userId: 'B', revision: 1, value: { rate: 99 } });
  await expect(s.sync.reload()).rejects.toMatchObject({ code: 'settings_owner_mismatch' }); expect(s.cache.save).not.toHaveBeenCalled();
});
it('offline calculator loads cache but settings save fails', async () => {
  const s = setup(); await s.sync.reload(); s.offline(); s.cache.save.mockClear();
  expect(await s.sync.load()).toEqual({ rate: 10 });
  await expect(s.sync.save({ rate: 30 })).rejects.toMatchObject({ code: 'offline' }); expect(s.cache.save).not.toHaveBeenCalled();
});
it('real user cache uploads defaults without changing existing Calculation snapshots or user B settings', async () => {
  const db = new EstimatorDatabase('cloud-settings-snapshots');
  try {
    const cache = new DexieCalculatorSettingsRepository(db, 'A');
    const decode = (value: unknown) => copyCalculatorSettings(value as CalculatorSettings);
    let record: CloudSettingsRecord<CalculatorSettings> | null = null;
    const cloud: CloudSettingsRepository<CalculatorSettings> = {
      load: async () => record,
      create: async (value) => { record = { userId: 'A', revision: 1, value: decode(value) }; return record; },
      update: async (value, revision) => { record = { userId: 'A', revision: revision + 1, value: decode(value) }; return record; },
    };
    const calculation = pack(estimateWindow(input, createDefaultCalculatorSettings().glazing));
    await db.ownedCalculations.put({ key: ownedKey('A', calculation.id), userId: 'A', calculation });
    const b = new DexieCalculatorSettingsRepository(db, 'B'); await b.save(createDefaultCalculatorSettings());
    const sync = new CloudSettingsSync('A', cache, cloud, decode, () => true);
    const settings = await sync.reload(); expect(settings).toEqual(createDefaultCalculatorSettings());
    const snapshot = createSettingsSnapshot(settings);
    settings.glazing.profiles[0]!.basePricePerM2 = 123;
    await sync.save(settings);
    expect((await db.ownedCalculations.get(ownedKey('A', calculation.id)))?.calculation).toEqual(calculation);
    expect(snapshot.glazing.profiles[0]!.basePricePerM2).toBe(10000);
    expect((await b.load()).glazing.profiles[0]!.basePricePerM2).toBe(10000);
  } finally { await db.delete(); }
});
it('empty document defaults roundtrip as initialization but explicit save still requires contacts', async () => {
  const db = new EstimatorDatabase('cloud-documents-defaults');
  try {
    const cache = new DexieDocumentSettingsRepository(db, 'A');
    const value = await cache.load(); await cache.saveCache(decodeDocumentSettingsCache(value));
    expect(await cache.load()).toEqual({ sellerName: '', sellerPhone: '' });
    await expect(cache.save(value)).rejects.toThrow();
    expect(() => decodeDocumentSettingsCache({ sellerName: '', sellerPhone: '', companyName: 'Incomplete' })).toThrow();
  } finally { await db.delete(); }
});
it('initialization race reloads winner and never overwrites it', async () => {
  const s = setup();
  vi.mocked(s.cloud.load).mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: 'A', revision: 1, value: { rate: 50 } });
  vi.mocked(s.cloud.create).mockRejectedValueOnce(new SettingsSyncError('settings_changed_elsewhere'));
  expect(await s.sync.reload()).toEqual({ rate: 50 }); expect(s.cloud.update).not.toHaveBeenCalled();
});
it('network load failure uses cache but requires reload before save', async () => {
  const s = setup(); vi.mocked(s.cloud.load).mockRejectedValueOnce(new SettingsSyncError('cloud_unavailable'));
  expect(await s.sync.load()).toEqual({ rate: 10 }); expect(s.sync.notice).not.toBe('');
  await expect(s.sync.save({ rate: 30 })).rejects.toMatchObject({ code: 'cloud_unavailable' });
  expect(s.cloud.update).not.toHaveBeenCalled();
});
