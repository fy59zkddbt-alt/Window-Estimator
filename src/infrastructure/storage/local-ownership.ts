import type { EstimatorDatabase } from './database';

export function ownedKey(userId: string, id: string): string {
  if (!userId.trim()) throw new Error('Не задан пользователь локального хранилища.');
  return JSON.stringify([userId, id]);
}

/** One atomic copy/claim; original anonymous stores and v2 backups remain intact. */
export async function claimAnonymousData(database: EstimatorDatabase, userId: string): Promise<void> {
  ownedKey(userId, '');
  await database.transaction('rw', [database.calculations, database.settings, database.ownedCalculations, database.ownedSettings], async () => {
    if (await database.settings.get('anonymousDataOwner')) return;
    const calculations = await database.calculations.toArray();
    for (const calculation of calculations) {
      const key = ownedKey(userId, calculation.id);
      if (await database.ownedCalculations.get(key)) throw new Error('Перенос остановлен: найден конфликт расчётов. Исходные данные сохранены.');
      await database.ownedCalculations.add({ key, userId, calculation });
    }
    for (const id of ['activeCalculationId', 'calculatorSettings', 'documentSettings']) {
      const record = await database.settings.get(id);
      if (!record) continue;
      const key = ownedKey(userId, id);
      if (await database.ownedSettings.get(key)) throw new Error('Перенос остановлен: найден конфликт настроек. Исходные данные сохранены.');
      await database.ownedSettings.add({ key, value: record.value });
    }
    await database.settings.add({ key: 'anonymousDataOwner', value: userId });
  });
}
