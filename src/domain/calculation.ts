import type { WindowMeasurement } from './measurements/window/types';
import type { BalconyMeasurement } from './measurements/balcony/types';
import type { WindowFinishMeasurement } from './measurements/window-finish/types';
import type { UserConfiguration } from './configuration/types';
import type { GlazingGeometry } from './geometry/types';
import type { GlazingPrice } from './pricing/glazing-pricing';

export type Measurement = WindowMeasurement | BalconyMeasurement | WindowFinishMeasurement;
/** First supported calculation. Other measurement kinds have no pricing flow yet. */
export interface Calculation {
  id: string;
  schemaVersion: 1;
  measurement: WindowMeasurement;
  configuration: UserConfiguration;
  geometry: GlazingGeometry;
  price: GlazingPrice;
}
