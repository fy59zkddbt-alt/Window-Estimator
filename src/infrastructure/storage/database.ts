import Dexie, { type Table } from 'dexie';
import type { Calculation } from '../../domain/calculation';
import { migrateCalculationV1 } from './migrate-calculation';

export class EstimatorDatabase extends Dexie {
  calculations!: Table<Calculation, string>;
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
  }
}
