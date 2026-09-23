import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { configuration, input } from './fixtures';

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
