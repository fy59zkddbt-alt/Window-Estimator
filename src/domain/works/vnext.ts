import type { CatalogEntry } from '../configuration/vnext/types';

/** Presentation metadata only; all units have the same future pricing rule. */
export type AdditionalWorkUnit = 'piece' | 'runningMeter' | 'squareMeter' | 'unit';
export interface AdditionalWorkCatalogEntry extends CatalogEntry {
  unitPriceMinor: number;
  unit?: AdditionalWorkUnit;
}
/** Owns its price/name/unit; catalogId is provenance, never a live lookup. */
export interface AdditionalWork {
  id: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  unit?: AdditionalWorkUnit;
  catalogId?: string;
}
export function validateWorkPrice(work: { unitPriceMinor: number; unit?: AdditionalWorkUnit }): void {
  if (!Number.isSafeInteger(work.unitPriceMinor) || work.unitPriceMinor < 0) throw new Error('Цена работы должна быть безопасным неотрицательным целым числом копеек.');
  if (work.unit !== undefined && !['piece', 'runningMeter', 'squareMeter', 'unit'].includes(work.unit)) throw new Error('Неизвестная единица работы.');
}
export function copyAdditionalWorks(works: readonly AdditionalWork[]): AdditionalWork[] {
  const ids = new Set<string>();
  return works.map((work) => {
    if (!work.id.trim() || ids.has(work.id) || !work.name.trim()) throw new Error('Работам нужны уникальные ID и названия.');
    ids.add(work.id);
    validateWorkPrice(work);
    if (!Number.isFinite(work.quantity) || work.quantity <= 0) throw new Error('Количество должно быть конечным положительным числом.');
    if (work.catalogId !== undefined && !work.catalogId.trim()) throw new Error('Пустой ID каталога.');
    return { ...work };
  });
}
export function createAdditionalWorkSnapshot(entry: AdditionalWorkCatalogEntry, id: string, quantity: number): AdditionalWork {
  if (entry.status !== 'active') throw new Error('Скрытая работа недоступна для добавления.');
  if (!entry.id.trim() || !entry.name.trim()) throw new Error('Некорректная работа каталога.');
  return copyAdditionalWorks([{ id, name: entry.name, catalogId: entry.id, unitPriceMinor: entry.unitPriceMinor,
    quantity, ...(entry.unit === undefined ? {} : { unit: entry.unit }) }])[0]!;
}
