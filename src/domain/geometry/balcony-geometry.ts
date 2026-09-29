import type { BalconyMeasurement, PlanePosition } from '../measurements/balcony/types';
import { validateBalcony } from '../measurements/balcony/create-balcony';
import type { GlazingGeometry, WindowGeometry, SectionGeometry } from './types';
import { openingSymbols } from './opening-symbols';

export interface BalconyPlaneGeometry extends WindowGeometry { id: string; name: string; position: PlanePosition; sandwichAreaM2: number }
export interface BalconyGeometry extends GlazingGeometry { sandwichAreaM2: number; planes: readonly BalconyPlaneGeometry[] }
const area = (w: number, h: number) => (w / 1000) * (h / 1000);
export function getBalconyGeometry(measurement: BalconyMeasurement): BalconyGeometry {
  validateBalcony(measurement);
  const planes = measurement.planes.map((p): BalconyPlaneGeometry => {
    const lowerHeight = p.levels.mode === 'twoLevel' ? p.levels.splitHeightMm : 0;
    const upperHeight = p.heightMm - lowerHeight;
    let xMm = 0;
    const upper = p.sections.map((s): SectionGeometry => {
      const rectangle = { xMm, yMm: 0, widthMm: s.widthMm, heightMm: upperHeight };
      xMm += s.widthMm;
      return { ...s, ...rectangle, areaM2: area(s.widthMm, upperHeight), symbols: openingSymbols(rectangle, s), fill: 'glass' };
    });
    const lowerFill = p.levels.mode === 'twoLevel' ? p.levels.lowerFill : 'glass';
    const lower: SectionGeometry[] = p.levels.mode === 'twoLevel' ? upper.map((s) => ({
      id: `lower:${s.id}`, xMm: s.xMm, yMm: upperHeight, widthMm: s.widthMm, heightMm: lowerHeight,
      openingType: 'fixed', areaM2: area(s.widthMm, lowerHeight), symbols: [], fill: lowerFill,
    })) : [];
    // Use separate namespaced preview IDs even if a user section ID begins with "lower:".
    const sections = [...upper.map((s) => ({ ...s, id: `upper:${s.id}` })), ...lower];
    const totalAreaM2 = area(p.widthMm, p.heightMm);
    const rawActive = upper.reduce((sum, s) => sum + (s.openingType === 'fixed' ? 0 : s.areaM2), 0);
    if (!Number.isFinite(totalAreaM2) || totalAreaM2 <= 0 || !Number.isFinite(rawActive) || rawActive - totalAreaM2 > 32 * Number.EPSILON * totalAreaM2 || sections.some((s) => !Number.isFinite(s.areaM2) || s.areaM2 <= 0)) throw new Error('Площадь вне допустимого диапазона.');
    return { id: p.id, name: p.name, position: p.position, totalAreaM2, activeAreaM2: Math.min(rawActive, totalAreaM2),
      sandwichAreaM2: p.levels.mode === 'twoLevel' && p.levels.lowerFill === 'sandwich' ? area(p.widthMm, lowerHeight) : 0,
      bounds: { xMm: 0, yMm: 0, widthMm: p.widthMm, heightMm: p.heightMm }, sections, transom: null,
      ...(lowerHeight ? { splitLine: [{ xMm: 0, yMm: upperHeight }, { xMm: p.widthMm, yMm: upperHeight }] } : {}) };
  });
  const totalAreaM2 = planes.reduce((sum, p) => sum + p.totalAreaM2, 0);
  const activeAreaM2 = planes.reduce((sum, p) => sum + p.activeAreaM2, 0);
  const sandwichAreaM2 = planes.reduce((sum, p) => sum + p.sandwichAreaM2, 0);
  if (![totalAreaM2, activeAreaM2, sandwichAreaM2].every(Number.isFinite)) throw new Error('Площадь балкона вне допустимого диапазона.');
  return { planes, totalAreaM2, activeAreaM2, sandwichAreaM2 };
}
