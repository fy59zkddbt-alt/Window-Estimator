import type { Calculation } from '../../domain/calculation-vnext';
import type { DocumentSettings } from '../../domain/documents/document-settings';
import type { ProposalDocumentV2, ProposalItemV2, ProposalMoneyV2, ProposalSchemeGeometryV2, ProposalWorkV2 } from '../../domain/documents/proposal-document-v2';
import type { WindowGeometry } from '../../domain/geometry/types';
import type { GlazingConfiguration } from '../../domain/configuration/vnext/types';
import type { AdditionalWorkLineVNext, MeasurementTotalsVNext } from '../estimate/estimate-calculation-vnext';
import { estimateCalculationVNext } from '../estimate/estimate-calculation-vnext';

/** Format integers directly: dividing safe minor units through Number loses cents near MAX_SAFE_INTEGER. */
export function proposalMoneyV2(minor: number): ProposalMoneyV2 {
  if (!Number.isSafeInteger(minor)) throw new Error('Некорректная денежная сумма документа.');
  const absolute = BigInt(minor < 0 ? -minor : minor);
  const display = (minor < 0 ? '−' : '') + new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' })
    .formatToParts(absolute / 100n).map((part) => part.type === 'fraction' ? String(absolute % 100n).padStart(2, '0') : part.value).join('');
  return { currency: 'RUB', minor, display };
}
const amount = (minor: number | null) => minor === null ? null : proposalMoneyV2(minor);
const openingLabels = { fixed: 'Глухая', turn: 'Поворотная', tilt_turn: 'Поворотно-откидная', sliding: 'Раздвижная' };
const hingeLabels = { left: 'Петли слева', right: 'Петли справа' };
const laminationLabels = { none: 'Без ламинации', one_side: 'Ламинация с одной стороны', two_sides: 'Ламинация с двух сторон' };
const planeLabels = { left: 'Левая сторона', facade: 'Передняя сторона', right: 'Правая сторона' };
const shapeLabels = { straight: 'Прямой балкон', L: 'Г-образный балкон', U: 'П-образный балкон' };
const typeLabels = { single: 'Одностворчатое окно', double: 'Двустворчатое окно', triple: 'Трёхстворчатое окно', balconyBlock: 'Балконный блок' };
const workLabels = { interiorSlopes: 'Откосы', interiorSlopesAndSill: 'Откосы и подоконник', sillOnly: 'Подоконник',
  exteriorSlopes: 'Наружные откосы', exteriorSlopesAndDrip: 'Наружные откосы и отлив', dripOnly: 'Отлив' };
const elementLabels = { slope: 'Откосы', sill: 'Подоконник', drip: 'Отлив' };
const lineLabels = { glazingProduct: 'Изделие', glazingInstallation: 'Монтаж', finish: 'Отделка под ключ' };
const units = { piece: 'шт.', runningMeter: 'пог. м', squareMeter: 'м²', unit: 'ед.' };
const rectangle = ({ xMm, yMm, widthMm, heightMm }: WindowGeometry['bounds']) => ({ xMm, yMm, widthMm, heightMm });

function scheme(geometry: WindowGeometry, configuration: GlazingConfiguration, doorId?: string): ProposalSchemeGeometryV2 {
  const doorIndex = geometry.sections.findIndex((section) => section.id === doorId);
  return { bounds: rectangle(geometry.bounds), transom: geometry.transom ? rectangle(geometry.transom) : null,
    ...(geometry.splitLine ? { splitLine: geometry.splitLine.map((point) => ({ ...point })) } : {}),
    sections: geometry.sections.map((section, index) => ({ ...rectangle(section),
      label: section.id === doorId ? 'Дверь' : geometry.splitLine
        ? `${section.id.startsWith('lower:') ? 'Нижний' : 'Верхний'} ряд · секция ${index % (geometry.sections.length / 2) + 1}`
        : `Секция ${index + 1 - (doorIndex >= 0 && index > doorIndex ? 1 : 0)}`,
      openingLabel: openingLabels[section.openingType],
      ...(section.hingeSide ? { hingeLabel: hingeLabels[section.hingeSide] } : {}),
      ...(section.hardwareId ? { hardwareLabel: configuration.hardware.find((entry) => entry.id === section.hardwareId)!.name } : {}),
      fill: section.fill ?? 'glass', symbols: section.symbols.map((symbol) => ({ kind: symbol.kind, points: symbol.points.map((point) => ({ ...point })) })) })) };
}
function works(lines: readonly AdditionalWorkLineVNext[]): ProposalWorkV2[] {
  return lines.map(({ work, clientPriceMinor }) => ({ name: work.name, quantity: work.quantity,
    ...(work.unit ? { unitLabel: units[work.unit] } : {}), amount: proposalMoneyV2(clientPriceMinor) }));
}
function item(line: MeasurementTotalsVNext): ProposalItemV2 {
  const measurement = line.result.measurement;
  const common = { id: line.measurementId, name: measurement.name, room: measurement.room,
    pricingStatus: line.pricingStatus === 'priced' ? 'priced' as const : 'needsClarification' as const,
    ...(line.pricingStatus === 'unresolved' ? { clarification: 'Цена отделки требует уточнения' } : {}),
    priceLines: line.clientLines.map((entry) => ({ label: lineLabels[entry.kind], amount: proposalMoneyV2(entry.clientPriceMinor) })),
    additionalWorks: works(line.additionalWorkLines), total: amount(line.measurementTotalMinor) };
  if (line.kind === 'WindowFinish') {
    const { measurement: m, configuration } = line.result;
    return { ...common, kind: 'WindowFinish', typeLabel: 'Отделка под ключ',
      dimensions: [{ label: 'Проём', widthMm: m.widthMm, heightMm: m.heightMm, depthMm: m.depthMm }], schemes: [],
      properties: [{ label: 'Сторона', value: m.side === 'interior' ? 'Внутри помещения' : 'Снаружи помещения' },
        { label: 'Состав', value: workLabels[m.workType] }, ...m.selections.map((selection) => ({ label: elementLabels[selection.element],
          value: configuration.materials.find((material) => material.id === selection.materialId)!.name }))] };
  }
  const { measurement: m, configuration, geometry } = line.result;
  const color = configuration.colors.find((entry) => entry.id === m.colorId)!;
  const properties = [{ label: 'Материал', value: m.material === 'pvc' ? 'ПВХ' : 'Алюминий' },
    { label: m.material === 'pvc' ? 'Профиль' : 'Система', value: configuration.profiles.find((entry) => entry.id === m.profileId)!.name },
    { label: 'Цвет', value: color.name }, { label: 'Ламинация', value: laminationLabels[color.lamination] },
    ...(m.extensions ? [{ label: 'Комплектация', value: 'Расширители' }] : []),
    ...(m.connectors ? [{ label: 'Комплектация', value: 'Соединители' }] : [])];
  if (m.kind === 'Balcony' && 'planes' in geometry) {
    return { ...common, kind: 'Balcony', typeLabel: shapeLabels[m.balconyType], properties,
      dimensions: m.planes.map((plane) => ({ label: planeLabels[plane.position], widthMm: plane.widthMm, heightMm: plane.heightMm })),
      schemes: geometry.planes.map((plane, index) => {
        const source = m.planes[index]!;
        const rows = source.levels.mode === 'oneLevel' ? 'Один ряд на всю высоту'
          : `Два ряда · нижний ${source.levels.splitHeightMm} мм · ${source.levels.lowerFill === 'sandwich' ? 'сэндвич-панель' : 'стекло'}`;
        const mode = 'mode' in source ? ` · ${source.mode === 'sliding' ? 'Раздвижное' : 'Распашное'} открывание` : '';
        return { label: `${planeLabels[source.position]} · ${rows}${mode}`, geometry: scheme(plane, configuration) };
      }) };
  }
  if (m.kind !== 'Window' || !('bounds' in geometry)) throw new Error('Несовместимая геометрия документа.');
  if (m.material === 'aluminium') properties.push({ label: 'Открывание', value: m.plane.mode === 'sliding' ? 'Раздвижное' : 'Распашное' });
  const dimensions = m.windowType === 'balconyBlock'
    ? [{ label: 'Оконная часть', widthMm: m.plane.sections.reduce((width, section) => width + section.widthMm, 0), heightMm: m.windowHeightMm },
      { label: 'Дверь', widthMm: m.doorWidthMm, heightMm: m.doorHeightMm }]
    : [{ label: 'Окно', widthMm: m.widthMm, heightMm: m.heightMm }];
  return { ...common, kind: m.windowType === 'balconyBlock' ? 'balconyBlock' : 'Window', typeLabel: typeLabels[m.windowType],
    dimensions, properties, schemes: [{ label: 'Вид из помещения', geometry: scheme(geometry, configuration, m.windowType === 'balconyBlock' ? m.door.id : undefined) }] };
}

/** Single pure v4 entry point. Feature 5 evaluates once and remains the only totals authority.
 * The mapper copies its client lines/results; it never prices, aggregates, discounts or rounds.
 * Computing fresh results here prevents accidental use of a stale caller-supplied estimate.
 */
export function buildProposalDocumentV2(calculation: Calculation, seller?: DocumentSettings): ProposalDocumentV2 {
  const totals = estimateCalculationVNext(calculation);
  const status = !totals.measurements.length ? 'empty' : totals.pricingStatus === 'unresolved' ? 'needsClarification'
    : !totals.isFinalized ? 'needsConfirmation' : 'ready';
  const messages = { empty: 'В расчёте пока нет замеров', needsClarification: 'Цена отделки требует уточнения. Итоговая стоимость будет известна после уточнения.',
    needsConfirmation: 'Итоговая стоимость требует подтверждения' };
  const sellerSnapshot = seller ? Object.fromEntries((['sellerName', 'sellerPhone', 'telegram', 'whatsapp', 'email', 'companyName', 'inn', 'companyPhone', 'website'] as const)
    .flatMap((key) => seller[key]?.trim() ? [[key, seller[key]!.trim()]] : [])) : undefined;
  return { version: 2, context: { calculationId: calculation.id, createdAt: calculation.createdAt, updatedAt: calculation.updatedAt,
    ...Object.fromEntries((['name', 'clientName', 'clientPhone', 'objectAddress'] as const).flatMap((key) => calculation[key]?.trim() ? [[key, calculation[key]]] : [])) },
    ...(sellerSnapshot && Object.keys(sellerSnapshot).length ? { seller: sellerSnapshot } : {}),
    items: totals.measurements.map(item), orderAdditionalWorks: works(totals.orderAdditionalWorkLines),
    summary: { status, ...(status === 'ready' ? {} : { message: messages[status] }),
      measurementsSubtotal: amount(totals.measurementsSubtotalMinor), orderWorksTotal: proposalMoneyV2(totals.orderWorksTotalMinor),
      subtotal: amount(totals.subtotalMinor),
      discount: totals.discountMode !== 'none' && totals.discountAmountMinor !== null
        ? { label: totals.discount.mode === 'percent' ? `Скидка ${totals.discount.discountPercent.toLocaleString('ru-RU', { maximumSignificantDigits: 17 })}%` : 'Скидка', amount: proposalMoneyV2(totals.discountAmountMinor) } : null,
      roundingAdjustment: amount(totals.commercialRoundingAdjustmentMinor),
      total: status === 'ready' ? amount(totals.finalTotalMinor) : null } };
}
