export interface AdditionalWork {
  id: string;
  name: string;
  priceMinor: number;
}

export function normalizeAdditionalWorks(works: readonly AdditionalWork[] | undefined): AdditionalWork[] {
  if (works === undefined) return [];
  if (!Array.isArray(works)) throw new Error('Некорректный список дополнительных работ.');
  const ids = new Set<string>();
  return works.map((work) => {
    if (!work || typeof work.id !== 'string' || !work.id.trim() || ids.has(work.id)) throw new Error('ID работ должны быть непустыми и уникальными внутри списка.');
    if (typeof work.name !== 'string' || !work.name.trim()) throw new Error('Укажите название дополнительной работы.');
    if (!Number.isSafeInteger(work.priceMinor) || work.priceMinor < 0) throw new Error('Цена работы должна быть неотрицательной суммой в целых копейках.');
    ids.add(work.id);
    return { id: work.id, name: work.name.trim(), priceMinor: work.priceMinor };
  });
}
