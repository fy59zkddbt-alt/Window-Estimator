import { validateWindow } from '../measurements/window/create-window';
import type { WindowMeasurement } from '../measurements/window/types';
import type { GlazingGeometry } from './types';

export function getWindowGeometry(window: WindowMeasurement): GlazingGeometry {
  validateWindow(window);
  const section = window.plane.sections[0];
  const totalArea = (section.widthMm / 1000) * (section.heightMm / 1000);
  if (!Number.isFinite(totalArea) || totalArea <= 0) throw new Error('Площадь вне допустимого числового диапазона.');
  return { totalArea, activeArea: section.openingType === 'fixed' ? 0 : totalArea };
}
