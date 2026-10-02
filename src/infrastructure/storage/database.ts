import Dexie, { type Table } from 'dexie';
import type { Calculation } from '../../domain/calculation';
import { migrateCalculationV1, migrateCalculationV2 } from './migrate-calculation';

export class EstimatorDatabase extends Dexie {
  calculations!: Table<Calculation, string>;
  settings!: Table<{ key: string; value: string }, string>;
  ownedCalculations!: Table<{ key: string; userId: string; calculation: Calculation }, string>;
  ownedSettings!: Table<{ key: string; value: string }, string>;
  constructor(name = 'window-estimator') {
    super(name);
    this.version(1).stores({ calculations: 'id' });
    this.version(2).stores({ calculations: 'id' }).upgrade(async (transaction) => {
      const table = transaction.table('calculations');
      await table.toCollection().modify((record, context) => {
        // Replacing the whole object also removes retired v1 fields. Failure rolls back the transaction.
        context.value = migrateCalculationV1(record);
      });
    });
    this.version(3).stores({ calculations: 'id,updatedAt', settings: 'key', legacyCalculations: 'id' }).upgrade(async (transaction) => {
      const table = transaction.table('calculations');
      const records = await table.toArray();
      const migratedAt = new Date().toISOString();
      // Preserve original v2 snapshots; a failure anywhere rolls back all stores together.
      for (const record of records) {
        await transaction.table('legacyCalculations').put(record);
        await table.put(migrateCalculationV2(record, migratedAt));
      }
      if (records[0]) await transaction.table('settings').put({ key: 'activeCalculationId', value: records[0].id });
    });
    // Ownership lives in storage envelopes, never in Calculation/Measurement.
    // Existing stores are retained as anonymous backups; claim happens after login.
    this.version(4).stores({ ownedCalculations: 'key,userId', ownedSettings: 'key' });
  }
}
