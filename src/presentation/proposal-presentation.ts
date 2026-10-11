import type { ProposalDocumentV2, ProposalItemV2, ProposalWorkV2 } from '../domain/documents/proposal-document-v2';
import { customerMoney } from './customer-money';

/** Customer document vocabulary shared by Client View, Image Export and PDF. */
export const proposalLabels = {
  title: 'Ваше предложение', units: 'Размеры в мм', viewpoint: 'Вид из помещения',
  total: 'Итого', works: 'Дополнительные работы', orderWorks: 'Дополнительные работы по заказу',
  summary: 'Стоимость предложения', clarification: 'Стоимость требует уточнения',
} as const;

export const proposalMm = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 6 });
export const workQuantity = (work: ProposalWorkV2) => `${work.quantity.toLocaleString('ru-RU', { maximumSignificantDigits: 17 })}${work.unitLabel ? ` ${work.unitLabel}` : ''}`;
const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];
const lowerFirst = (value: string) => value.charAt(0).toLocaleLowerCase('ru-RU') + value.slice(1);
export function planeHeading(label: string) {
  const heading = label.split(' · ')[0]!;
  return heading === 'Передняя сторона' ? 'Фасад' : heading;
}
/** Compact customer metadata; the scheme owns dimensions, rows and opening detail. */
export function itemPresentation(item: ProposalItemV2) {
  const property = (label: string) => item.properties.find((p) => p.label === label)?.value;
  const lines: string[] = [];
  if (item.kind === 'WindowFinish') {
    const side = property('Сторона');
    lines.push([side === 'Внутри помещения' ? 'Внутренняя' : side === 'Снаружи помещения' ? 'Наружная' : side, lowerFirst(property('Состав') || '')].filter(Boolean).join(' · '));
    lines.push(unique(item.properties.filter((p) => ['Откосы', 'Подоконник', 'Отлив'].includes(p.label)).map((p) => p.value)).join(' · '));
  } else {
    const aluminium = property('Материал') === 'Алюминий';
    const hardware = unique(item.schemes.flatMap((scheme) => scheme.geometry.sections.flatMap((s) => s.hardwareLabel ? [s.hardwareLabel] : [])));
    lines.push([aluminium ? 'Алюминий' : '', property(aluminium ? 'Система' : 'Профиль'), ...(!aluminium ? hardware : [])].filter(Boolean).join(' · '));
    const color = property('Цвет'); const lamination = property('Ламинация');
    if (aluminium) {
      const modes = unique([property('Открывание') || '', ...item.schemes.flatMap((scheme) => scheme.label.match(/Раздвижное|Распашное/g) || [])]);
      lines.push([color && `Цвет: ${color}`, ...modes].filter(Boolean).join(' · '));
    } else {
      if (lamination && lamination !== 'Без ламинации') lines.push(lamination);
      if (color && color !== 'Белый' && color !== lamination && !/^Ламинация(?:\s|$)/i.test(color)) lines.push(`Цвет: ${color}`);
    }
    const options = unique(item.properties.filter((p) => p.label === 'Комплектация').map((p) => lowerFirst(p.value)));
    if (options.length) lines.push(`Дополнительно: ${options.join(', ')}`);
  }
  const lowerFills = item.schemes.map((scheme) => {
    if (!scheme.geometry.splitLine) return '';
    const lowerY = scheme.geometry.splitLine[0]!.yMm;
    const fills = unique(scheme.geometry.sections.filter((s) => s.yMm >= lowerY).map((s) => s.fill === 'sandwich' ? 'сэндвич-панель' : 'стекло'));
    return fills.length ? `Низ — ${fills.join(', ')}` : '';
  });
  const commonFill = lowerFills.length && lowerFills.every((fill) => fill === lowerFills[0]) ? lowerFills[0]! : '';
  if (commonFill) lines.push(commonFill);
  return {
    // Rectangular type is visible in the drawing; balcony shape is useful context.
    subtitle: item.kind === 'Balcony' ? item.typeLabel : '',
    room: usefulRoom(item.name, item.room, item.kind),
    lines: lines.filter(Boolean),
    schemes: item.schemes.map((scheme, index) => ({ ...scheme, heading: planeHeading(scheme.label),
      note: commonFill ? '' : lowerFills[index] || '' })),
    showTotal: !!item.total && !(item.kind === 'WindowFinish' && !item.additionalWorks.length && item.priceLines.length === 1 && item.priceLines[0]!.amount.minor === item.total.minor),
  };
}
function usefulRoom(name: string, room: string, kind: ProposalItemV2['kind']) {
  if (kind === 'Balcony' && /^(балкон|лоджия)$/iu.test(room.trim())) return '';
  const words = (value: string) => value.toLocaleLowerCase('ru-RU').match(/[а-яёa-z0-9]+/gu) || [];
  // Common room inflections (спальня/спальни, гостиная/гостиной) add no new context.
  const stem = (word: string) => word.length > 3 ? word.replace(/(?:ая|яя|ой|ей|[аяиыеую])$/u, '') : word;
  const redundant = words(room).every(word => words(name).some(part => stem(part) === stem(word)));
  return redundant ? '' : room;
}
export function sellerLines(seller: ProposalDocumentV2['seller']): string[] {
  if (!seller) return [];
  const identity = unique([seller.companyName || '', seller.sellerName || '']).join(' · ');
  const contacts = [seller.sellerPhone || seller.companyPhone, seller.telegram && `Telegram: ${seller.telegram}`,
    seller.whatsapp && `WhatsApp: ${seller.whatsapp}`, seller.email, seller.website].filter((line): line is string => !!line).slice(0, 3);
  return [identity, contacts.join(' · ')].filter(Boolean);
}
export function summaryLines(summary: ProposalDocumentV2['summary']) {
  return summary.discount ? [
    ...(summary.subtotal ? [{ label: 'Сумма заказа', value: customerMoney(summary.subtotal) }] : []),
    { label: summary.discount.label, value: customerMoney(summary.discount.amount, true) },
  ] : [];
}

