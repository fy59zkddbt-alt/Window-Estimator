import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { active, fixed, configuration, input, profile } from './fixtures';

it('persists a calculation and tariff snapshot across database reopen', async () => {
  const db = new EstimatorDatabase('storage-test');
  const repository = new DexieCalculationRepository(db);
  const result = estimateWindow(input, configuration);
  try {
    expect(await repository.get(input.id)).toBeUndefined();
    await repository.save(result);
    db.close();
    await db.open();
    expect(await repository.get(input.id)).toEqual(result);
    await repository.save({ ...result, measurement: { ...result.measurement, name: 'Changed' } });
    expect(await db.calculations.count()).toBe(1);
    expect((await repository.get(input.id))?.measurement.name).toBe('Changed');
  } finally { await db.delete(); }
});

it('round-trips triple window with per-section hardware, widths and transom', async () => {
  const db = new EstimatorDatabase('storage-v2-triple');
  const repository = new DexieCalculationRepository(db);
  const result = estimateWindow({ ...input, windowType: 'triple', widthMm: 2100, sections: [active(500), fixed(700, 's2'), active(900, 's3', 'tilt_turn', 'right')], transom: { openingType: 'fixed', heightMm: 300 } }, configuration);
  try {
    await repository.save(result);
    db.close();
    await db.open();
    expect(await repository.get(input.id)).toEqual(result);
  } finally { await db.delete(); }
});

it.each(['fixed', 'turn', 'tilt_turn'] as const)('migrates v1 %s without losing parameters, tariffs or price', async (openingType) => {
  const databaseName = `migration-${openingType}`;
  const old = new Dexie(databaseName);
  old.version(1).stores({ calculations: 'id' });
  const config = { ...configuration, profiles: [{ ...profile, productMarkupPercent: 15 }] };
  const expectedMinor = openingType === 'fixed' ? 2070000 : 2415000;
  const legacy = {
    id: input.id, schemaVersion: 1, configuration: config,
    measurement: { kind: 'Window', id: input.id, room: 'Кухня', name: 'Окно 1', material: 'pvc',
      profileId: 'pvc', hardwareId: openingType === 'fixed' ? null : 'hardware', lamination: 'two_sides',
      plane: { id: 'plane', sections: [{ id: 'legacy-section', widthMm: 1000, heightMm: 1500, openingType,
        ...(openingType === 'fixed' ? {} : { hingeSide: 'right' }),
      }] },
    },
    geometry: { totalArea: 1.5, activeArea: openingType === 'fixed' ? 0 : 1.5 },
    price: { totalMinor: expectedMinor },
  };
  const db = new EstimatorDatabase(databaseName);
  try {
    await old.table('calculations').put(legacy);
    old.close();
    const saved = await new DexieCalculationRepository(db).get(input.id);
    expect(saved?.schemaVersion).toBe(2);
    expect(saved?.measurement).toMatchObject({ windowType: 'single', widthMm: 1000, heightMm: 1500, lamination: 'two_sides', room: 'Кухня', name: 'Окно 1' });
    expect(saved?.measurement).not.toHaveProperty('hardwareId');
    expect(saved?.measurement.plane.sections[0]).not.toHaveProperty('heightMm');
    expect(saved?.configuration).toEqual(config);
    expect(saved?.price.totalMinor).toBe(expectedMinor);
    if (openingType !== 'fixed') expect(saved?.measurement.plane.sections[0]).toMatchObject({ hingeSide: 'right', hardwareId: 'hardware', openingType });
    else expect(saved?.measurement.plane.sections[0]).not.toHaveProperty('hardwareId');
    db.close();
    await db.open();
    expect(await db.calculations.get(input.id)).toEqual(saved);
  } finally { old.close(); await db.delete(); }
});

it('rolls back migration of damaged records instead of silently replacing their dimensions', async () => {
  const databaseName = 'migration-invalid';
  const old = new Dexie(databaseName);
  old.version(1).stores({ calculations: 'id' });
  const record = { id: 'broken', schemaVersion: 1, measurement: { id: 'broken', kind: 'Window', plane: { sections: [] } } };
  const db = new EstimatorDatabase(databaseName);
  try {
    await old.table('calculations').put(record);
    old.close();
    await expect(db.open()).rejects.toThrow();
    db.close();
    await old.open();
    expect(await old.table('calculations').get('broken')).toEqual(record);
    expect(old.verno).toBe(1);
  } finally { old.close(); db.close(); await Dexie.delete(databaseName); }
});
