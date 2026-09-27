import type { FinishEstimate } from '../../domain/measurement-estimate';
import type { FinishConfiguration } from '../../domain/configuration/finish-types';
import { copyFinishSizing, normalizeFinishMaterial } from '../../domain/configuration/normalize-finish';
import { createWindowFinish, type WindowFinishInput } from '../../domain/measurements/window-finish/create-window-finish';
import { getFinishGeometry } from '../../domain/geometry/finish-geometry';
import { priceFinish } from '../../domain/pricing/finish-pricing';

export type { WindowFinishInput } from '../../domain/measurements/window-finish/create-window-finish';

export function estimateFinish(input: WindowFinishInput, configuration: FinishConfiguration): FinishEstimate {
  const measurement = createWindowFinish(input);
  if (configuration.currency !== 'RUB') throw new Error('Поддерживается валюта RUB.');
  if (new Set(configuration.materials.map((item) => item.id)).size !== configuration.materials.length) throw new Error('ID материалов должны быть уникальными.');
  const normalizedMaterials = measurement.selections.map((selection) => {
    const source = configuration.materials.find((item) => item.id === selection.materialId);
    if (!source || source.finishType !== selection.finishType) throw new Error('Выбранный материал не соответствует виду отделки.');
    return normalizeFinishMaterial(source);
  });
  const geometry = getFinishGeometry(measurement, normalizedMaterials.map((item) => ({ finishType: item.finishType, materialId: item.id, sizing: item.sizing })));
  const price = priceFinish(geometry, normalizedMaterials);
  return { id: measurement.id, schemaVersion: 2, measurement, normalizedMaterials, geometry, price,
    configuration: { currency: configuration.currency, materials: configuration.materials.map((item) => ({ ...item, sizing: copyFinishSizing(item.sizing),
      pricing: item.pricing.mode === 'simple'
        ? { ...item.pricing, ...(item.pricing.depthBands ? { depthBands: item.pricing.depthBands.map((band) => ({ ...band })) } : {}) }
        : { ...item.pricing, ...(item.pricing.depthBands ? { depthBands: item.pricing.depthBands.map((band) => ({ ...band })) } : {}) },
    })) },
  };
}
