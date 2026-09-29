import type { GlazingPlane, Lamination, Material, MeasurementIdentity, OpeningElement } from '../shared';
import type { AdditionalWork } from '../../works/types';

export type RectangularWindowType = 'single' | 'double' | 'triple';
export type WindowType = RectangularWindowType | 'balconyBlock';
export type DoorPosition = 'left' | 'middle' | 'right';
export interface Transom { heightMm: number; openingType: 'fixed' }

interface WindowCommon extends MeasurementIdentity {
  kind: 'Window';
  additionalWorks: readonly AdditionalWork[];
  material: Material;
  profileId: string;
  lamination: Lamination;
  /** Window sections in stable Window1/Window2 order; door is separate. */
  plane: GlazingPlane;
}

export type WindowMeasurement = WindowCommon & (
  | { windowType: RectangularWindowType; widthMm: number; heightMm: number; transom?: Transom }
  | {
    windowType: 'balconyBlock';
    door: OpeningElement;
    doorPosition: DoorPosition;
    doorWidthMm: number;
    doorHeightMm: number;
    windowHeightMm: number;
    // Bounding dimensions are derived geometry, never independent input for a block.
    widthMm?: never;
    heightMm?: never;
    transom?: never;
  }
);
