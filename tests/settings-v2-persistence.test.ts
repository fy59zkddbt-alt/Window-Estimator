import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { CloudSettingsSync, SettingsSyncError, type CloudSettingsRecord, type CloudSettingsRepository } from '../src/application/settings/cloud-settings';
import { openSettingsV2, persistSettingsV2, stageSettingsV2 } from '../src/application/settings/settings-v2';
import { copyCalculatorSettings, createDefaultCalculatorSettings, type CalculatorSettings } from '../src/domain/configuration/calculator-settings';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculatorSettingsRepository } from '../src/infrastructure/storage/dexie-calculator-settings-repository';

it('stages v2 through the existing owned cloud revision/cache path, with explicit confirmation and conflict safety', async () => {
  const db = new EstimatorDatabase('settings-v2-persistence');
  try {
    const cache = new DexieCalculatorSettingsRepository(db, 'A');
    const other = new DexieCalculatorSettingsRepository(db, 'B');
    await other.save(createDefaultCalculatorSettings());
    const decode = (value: unknown) => copyCalculatorSettings(value as CalculatorSettings);
    let record: CloudSettingsRecord<CalculatorSettings> | null = null;
    const revisions: number[] = [];
    const cloud: CloudSettingsRepository<CalculatorSettings> = {
      load: async () => record,
      create: async (value) => { record = { userId: 'A', revision: 1, value: decode(value) }; return record; },
      update: async (value, revision) => {
        revisions.push(revision);
        if (!record || record.revision !== revision) throw new SettingsSyncError('settings_changed_elsewhere');
        record = { userId: 'A', revision: revision + 1, value: decode(value) }; return record;
      },
    };
    let online = true;
    const sync = new CloudSettingsSync('A', cache, cloud, decode, () => online);
    const original = await sync.load();
    expect(original.settingsV2).toBeUndefined();
    const draft = openSettingsV2(original);
    const profile = draft.glazing.profiles[0]!; profile.name = 'Мой профиль';
    const ordinary = await persistSettingsV2(draft, false, (next) => sync.save(stageSettingsV2(original, next)));
    expect(revisions).toEqual([1]);
    expect((await cache.load()).settingsV2).toMatchObject({ pricesConfirmed: false });
    const loaded = await sync.reload();
    expect(openSettingsV2(loaded).glazing.profiles[0]!.name).toBe('Мой профиль');
    await persistSettingsV2(ordinary, true, (next) => sync.save(stageSettingsV2(loaded, next)));
    expect(revisions).toEqual([1, 2]);
    expect((await cache.load()).settingsV2?.pricesConfirmed).toBe(true);
    expect((await cache.load()).glazing).toEqual(original.glazing);
    expect((await other.load()).settingsV2).toBeUndefined();
    expect(record).not.toBeNull();
    record!.revision += 1;
    const before = await cache.load();
    await expect(sync.save(stageSettingsV2(loaded, draft))).rejects.toMatchObject({ code: 'settings_changed_elsewhere' });
    expect(await cache.load()).toEqual(before);
    online = false;
    expect(await sync.load()).toEqual(before);
    await expect(sync.save(stageSettingsV2(loaded, draft))).rejects.toMatchObject({ code: 'offline' });
    expect(await cache.load()).toEqual(before);
  } finally { await db.delete(); }
});

it('rejects corrupt v2 cache without replacing or rewriting original records', async () => {
  const db = new EstimatorDatabase('settings-v2-corrupt');
  try {
    const value = stageSettingsV2(createDefaultCalculatorSettings(), openSettingsV2(createDefaultCalculatorSettings()));
    value.settingsV2!.finish.materials[0]!.widthVariants[0]!.physicalWidthMm = -1;
    const raw = JSON.stringify(value);
    await db.settings.put({ key: 'calculatorSettings', value: raw });
    await expect(new DexieCalculatorSettingsRepository(db).load()).rejects.toThrow('повреждены');
    expect((await db.settings.get('calculatorSettings'))?.value).toBe(raw);
  } finally { await db.delete(); }
});
