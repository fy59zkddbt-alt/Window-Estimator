import type { Calculation } from '../../domain/calculation';
import { normalizeDocumentSettings, type DocumentSettings } from '../../domain/documents/document-settings';
import type { ProposalDocument, ProposalItem, ProposalPlane, ProposalSection } from '../../domain/documents/proposal-document';
import type { MeasurementEstimate, WindowEstimate, BalconyEstimate } from '../../domain/measurement-estimate';
import type { WindowGeometry } from '../../domain/geometry/types';
import { normalizeAdditionalWorks } from '../../domain/works/types';
import { estimateCalculation, type CalculationEstimate } from '../estimate/calculation-service';

export class ProposalDocumentError extends Error {
  constructor(public readonly code: 'INVALID_METADATA' | 'PRICE_NOT_CONFIRMED' | 'ESTIMATE_MISMATCH', message: string) {
    super(message);
    this.name = 'ProposalDocumentError';
  }
}

// Compare plain estimate values without depending on property insertion order.
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => sameData(value, b[i]));
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

const openingLabels = { fixed: 'Глухое', turn: 'Поворотное', tilt_turn: 'Поворотно-откидное', sliding: 'Раздвижное' };
const laminationLabels = { none: 'Без ламинации', one_side: 'Ламинация с одной стороны', two_sides: 'Ламинация с двух сторон' };

function planePresentation(geometry: WindowGeometry, result: WindowEstimate | BalconyEstimate, id: string, name: string): ProposalPlane {
  const m = result.measurement;
  return {
    id, name, bounds: { ...geometry.bounds }, areaM2: geometry.totalAreaM2,
    sections: geometry.sections.map((s, index): ProposalSection => ({
      id: s.id,
      label: m.kind === 'Window' && m.windowType === 'balconyBlock' && s.id === m.door.id ? 'Дверь' : `Секция ${index + 1}`,
      xMm: s.xMm, yMm: s.yMm, widthMm: s.widthMm, heightMm: s.heightMm,
      openingLabel: openingLabels[s.openingType],
      ...(s.hingeSide ? { hingeLabel: s.hingeSide === 'left' ? 'Петли слева' : 'Петли справа' } : {}),
      ...(s.hardwareId ? { hardwareName: result.configuration.hardware.find((h) => h.id === s.hardwareId)!.name } : {}),
      fillLabel: s.fill === 'sandwich' ? 'Сэндвич-панель' : 'Стекло',
      symbols: s.symbols.map((symbol) => ({ kind: symbol.kind, points: symbol.points.map((p) => ({ ...p })) })),
    })),
    transom: geometry.transom ? {
      label: 'Глухая верхняя фрамуга', xMm: geometry.transom.xMm, yMm: geometry.transom.yMm,
      widthMm: geometry.transom.widthMm, heightMm: geometry.transom.heightMm,
    } : null,
    ...(geometry.splitLine ? { splitLine: geometry.splitLine.map((p) => ({ ...p })) } : {}),
  };
}

function presentationItem(line: CalculationEstimate['lines'][number]): ProposalItem {
  const result: MeasurementEstimate = line.result;
  const m = result.measurement;
  const common = {
    id: m.id, name: m.name, room: m.room, description: line.description, dimensionsText: line.dimensions,
    basePriceMinor: result.basePriceMinor, additionalWorks: normalizeAdditionalWorks(m.additionalWorks),
    additionalWorksTotalMinor: result.additionalWorksTotalMinor, measurementTotalMinor: result.measurementTotalMinor,
  };
  // Nested measurement discriminants do not narrow the enclosing estimate union.
  if ('normalizedMaterials' in result) {
    const finish = result.measurement;
    return { ...common, kind: 'WindowFinish',
      dimensions: [{ label: 'Проём и глубина отделки', widthMm: finish.widthMm, heightMm: finish.heightMm, depthMm: finish.depthMm }],
      finishes: result.geometry.materials.map((material) => ({
        label: material.finishType === 'slope' ? 'Откосы' : 'Подоконник',
        materialName: result.normalizedMaterials.find((n) => n.id === material.materialId)!.name,
        installedLengthM: material.actualInstalledLengthM,
        pieces: material.pieces.map((piece) => ({
          label: { top: 'Верхний откос', left: 'Левый откос', right: 'Правый откос', sill: 'Подоконник' }[piece.part],
          installedLengthMm: piece.installedLengthMm, depthMm: finish.depthMm,
        })),
      })),
    };
  }
  const glazing = result.measurement;
  const planes = 'planes' in result.geometry
    ? result.geometry.planes.map((p) => planePresentation(p, result, p.id, p.name))
    : [planePresentation(result.geometry, result, glazing.id, glazing.name)];
  const materialLabel = glazing.material === 'pvc' ? 'ПВХ' : 'Алюминий';
  const description = glazing.kind === 'Balcony'
    ? `${{ straight: 'Прямое остекление балкона', L: 'Г-образное остекление балкона', U: 'П-образное остекление балкона' }[glazing.balconyType]}${glazing.side ? ` · ${glazing.side === 'left' ? 'левая сторона' : 'правая сторона'}` : ''} · ${materialLabel}`
    : common.description;
  return { ...common, kind: glazing.kind, description,
    materialLabel,
    profileName: result.configuration.profiles.find((p) => p.id === glazing.profileId)!.name,
    laminationLabel: laminationLabels[glazing.lamination], areaM2: result.geometry.totalAreaM2,
    productPriceMinor: result.price.productPriceMinor, installationPriceMinor: result.price.installationPriceMinor,
    dimensions: planes.map((p) => ({ label: p.name, widthMm: p.bounds.widthMm, heightMm: p.bounds.heightMm })), planes,
  };
}

/** Pure preparation; caller supplies ID/time. No I/O, global settings, pricing formulas or PDF. */
export function createProposalDocument(
  calculation: Calculation, estimate: CalculationEstimate, settings: DocumentSettings,
  metadata: Pick<ProposalDocument, 'id' | 'generatedAt'>,
): ProposalDocument {
  if (!metadata.id.trim() || !Number.isFinite(Date.parse(metadata.generatedAt))) {
    throw new ProposalDocumentError('INVALID_METADATA', 'Укажите ID и корректную дату коммерческого предложения.');
  }
  const seller = normalizeDocumentSettings(settings);
  // Reuse the authoritative application pipeline to reject stale/tampered estimates.
  // Geometry and price formulas remain exclusively in the existing engines.
  const current = estimateCalculation(calculation);
  if (!current.isFinalized || current.finalTotalMinor === null || current.discountAmountMinor === null) {
    throw new ProposalDocumentError('PRICE_NOT_CONFIRMED', 'Подтвердите итоговую фиксированную цену перед созданием коммерческого предложения.');
  }
  if (!sameData(current, estimate)) {
    throw new ProposalDocumentError('ESTIMATE_MISMATCH', 'Смета не соответствует текущему расчёту. Обновите смету перед созданием коммерческого предложения.');
  }
  return {
    id: metadata.id, generatedAt: metadata.generatedAt, currency: 'RUB', seller,
    customer: {
      ...(calculation.clientName !== undefined ? { clientName: calculation.clientName } : {}),
      ...(calculation.clientPhone !== undefined ? { clientPhone: calculation.clientPhone } : {}),
      ...(calculation.objectAddress !== undefined ? { objectAddress: calculation.objectAddress } : {}),
    },
    items: estimate.lines.map(presentationItem), orderWorks: normalizeAdditionalWorks(calculation.orderAdditionalWorks),
    totals: {
      measurementsSubtotalMinor: current.measurementsSubtotalMinor, orderWorksTotalMinor: current.orderWorksTotalMinor,
      subtotalMinor: current.subtotalMinor, discountMode: current.discountMode,
      ...(current.discount.mode === 'percent' ? { discountPercent: current.discount.discountPercent } : {}),
      discountAmountMinor: current.discountAmountMinor, finalTotalMinor: current.finalTotalMinor,
    },
  };
}
