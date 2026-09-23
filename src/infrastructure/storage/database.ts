import Dexie, { type Table } from 'dexie';
import type { Calculation } from '../../domain/calculation';

export class EstimatorDatabase extends Dexie {
  calculations!: Table<Calculation, string>;
  constructor(name = 'window-estimator') {
    super(name);
    this.version(1).stores({ calculations: 'id' });
  }
}
