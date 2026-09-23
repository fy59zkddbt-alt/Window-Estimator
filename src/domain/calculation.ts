import type { WindowMeasurement } from './measurements/window/types';
import type { BalconyMeasurement } from './measurements/balcony/types';
import type { WindowFinishMeasurement } from './measurements/window-finish/types';
import type { UserConfiguration } from './configuration/types';
import type { WindowGeometry } from './geometry/types';
import type { GlazingPrice } from './pricing/glazing-pricing';

export type Measurement = WindowMeasurement | BalconyMeasurement | WindowFinishMeasurement;
/** Window calculation. Other measurement kinds have no pricing flow yet. */
export interface Calculation {
  id: string;
  schemaVersion: 2;
  measurement: WindowMeasurement;
  configuration: UserConfiguration;
  geometry: WindowGeometry;
  price: GlazingPrice;
}
