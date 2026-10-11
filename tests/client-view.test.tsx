import { customerMoney } from '../src/presentation/customer-money';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { ClientView } from '../src/ui/ClientView';
import { buildProposalDocumentV2, proposalMoneyV2 } from '../src/application/documents/build-proposal-document-v2';
import { estimateCalculationVNext } from '../src/application/estimate/estimate-calculation-vnext';
import type { ProposalDocumentV2 } from '../src/domain/documents/proposal-document-v2';
import { proposalCalculation, proposalWindow, proposalBalcony, proposalBlock, proposalFinish } from './fixtures/proposal-v2';
import * as money from '../src/domain/money';

const html = (document: ProposalDocumentV2) => renderToStaticMarkup(<ClientView document={document} onBack={() => {}} />);
const text = (markup: string) => markup.replace(/<[^>]+>/g, '');
describe('Feature 12 read-only Client View', () => {
  it('renders a standalone serialized document without Calculation, Settings or pricing', () => {
    const d: ProposalDocumentV2 = JSON.parse(JSON.stringify(buildProposalDocumentV2(proposalCalculation())));
    const source = readFileSync('src/ui/ClientView.tsx', 'utf8');
    expect(source).not.toMatch(/from .*calculation|from .*estimate|from .*pricing|from .*settings|buildProposalDocument/);
    expect(html(d)).toContain('Анна Иванова'); expect(html(d)).toContain('Новосибирск, Ленина, 7'); expect(html(d)).toContain('+7 900 1234567');
  });
  it('shows optional company/contact fields from document only', () => {
    const markup = html(buildProposalDocumentV2(proposalCalculation(), { sellerName: 'Иван', sellerPhone: '+7 900 7654321',
      companyName: 'Окна для вас', telegram: '@okna', whatsapp: '9001234567', email: 'okna@example.org', inn: '1234567890', website: 'https://example.org' }));
    for (const value of ['Иван', 'Окна для вас', '+7 900 7654321', '@okna', 'WhatsApp']) expect(markup).toContain(value);
    for (const value of ['okna@example.org', '1234567890', 'https://example.org']) expect(markup).not.toContain(value);
  });
  it('handles missing optional client and seller data without placeholders or invented dates', () => {
    const c = proposalCalculation(); delete c.clientName; delete c.clientPhone; delete c.objectAddress; delete c.name;
    const markup = html(buildProposalDocumentV2(c)); expect(markup).toContain('Ваше предложение'); expect(markup).not.toMatch(/undefined|null|Клиент не указан|Дата замера|Замерщик/);
  });
  it('renders Window with scheme, dimensions, unequal sections, opening/hardware/profile and transom', () => {
    const markup = html(buildProposalDocumentV2(proposalCalculation([proposalWindow()])));
    for (const value of ['Схема: Окно спальни', '1 400', '1 500', '500', '900', '1 300', '200', 'VEKA Softline 70', 'Mako', 'customer-opening turn', 'customer-opening tilt']) expect(markup).toContain(value);
    expect(markup).toContain('preserveAspectRatio="xMidYMid meet"'); expect(markup).toContain('viewBox="0 0 1400 1500"');
  });
  it.each(['straight', 'L', 'U'] as const)('renders %s Balcony as separate ready plane schemes', (shape) => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalBalcony(shape)])); const markup = html(d);
    expect(markup.match(/<svg role="img"/g)).toHaveLength({ straight: 1, L: 2, U: 3 }[shape]); expect(markup).toContain(d.items[0]!.typeLabel);
    expect(markup).toContain('VEKA'); expect(markup).not.toContain('Один ряд на всю высоту');
  });
  it.each(['sliding', 'swing'] as const)('renders aluminium %s with customer labels', (mode) => {
    const markup = html(buildProposalDocumentV2(proposalCalculation([proposalBalcony('L', 'aluminium', mode)])));
    expect(markup).toContain('Алюминий'); expect(markup).toContain(mode === 'sliding' ? 'Раздвижное' : 'Распашное'); expect(markup).not.toContain('Mako');
  });
  it.each(['glass', 'sandwich'] as const)('renders two rows and lower %s', (fill) => {
    const markup = html(buildProposalDocumentV2(proposalCalculation([proposalBalcony('U', 'pvc', 'sliding', fill)])));
    expect(markup).not.toContain('Верхний ряд'); expect(markup).toContain('>600</text>'); expect(markup).toContain(fill === 'glass' ? 'стекло' : 'сэндвич-панель');
  });
  it('renders block door/window geometry, split, dimensions, profile and hardware', () => {
    const markup = html(buildProposalDocumentV2(proposalCalculation([proposalBlock()])));
    for (const value of ['Выход на лоджию', '700', '2 200', '800', '600', '1 500', 'VEKA', 'Mako']) expect(markup).toContain(value);
    expect(markup).toContain('viewBox="0 0 2100 2200"');
  });
  it.each(['automatic', 'manual'] as const)('renders %s finish as turnkey client price without internal price mode', (mode) => {
    const markup = html(buildProposalDocumentV2(proposalCalculation([proposalFinish(mode)])));
    expect(markup).toContain('Отделка под ключ'); expect(markup).toContain('откосы и подоконник'); expect(markup).toContain('Внутренняя');
    expect(markup).not.toMatch(/автоматически|вручную|себестоимость|зарплат|наценк|запас 20/i); if (mode === 'manual') expect(markup).toContain('1 234,56 ₽');
  });
  it('shows canonical measurement and order works, quantities and final line amounts', () => {
    const m = proposalWindow(); m.additionalWorks = [{ id: 'work', name: 'Демонтаж окна', unitPriceMinor: 12345, quantity: 1.25, unit: 'runningMeter' }];
    const c = proposalCalculation([m]); c.orderAdditionalWorks = [{ id: 'work', name: 'Доставка', unitPriceMinor: 23456, quantity: 2, unit: 'piece' }];
    const d = buildProposalDocumentV2(c); const markup = html(d);
    expect(markup).toContain('Демонтаж окна'); expect(markup).toContain('1,25 пог. м'); expect(markup).toContain('Доставка'); expect(markup).toContain('2 шт.');
    expect(markup).toContain(customerMoney(d.items[0]!.additionalWorks[0]!.amount)); expect(markup).toContain(customerMoney(d.orderAdditionalWorks[0]!.amount));
  });
  it.each(['none', 'percent', 'fixedFinalPrice'] as const)('renders canonical %s summary and exact final total', (mode) => {
    const c = proposalCalculation(); c.discount = mode === 'none' ? { mode } : mode === 'percent' ? { mode, discountPercent: 7.25 }
      : { mode, fixedFinalPriceMinor: 1234567, confirmation: 'confirmed', confirmedSubtotalMinor: estimateCalculationVNext(c).subtotalMinor! };
    const d = buildProposalDocumentV2(c); const markup = html(d); expect(markup).toContain('data-testid="client-final"'); expect(markup).toContain(customerMoney(d.summary.total!));
    if (mode !== 'none') expect(markup).toContain(d.summary.discount!.label); expect(text(markup)).not.toMatch(/fixedFinalPrice|override|фиксирован/i);
  });
  it.each(['unresolved', 'pending'] as const)('renders %s finish clarification and never renders final total', (mode) => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalWindow(), proposalFinish(mode)])); const markup = html(d);
    expect(markup).toContain('Цена отделки требует уточнения'); expect(markup).not.toContain('client-final'); expect(markup).not.toContain('Сумма заказа');
    expect(markup).toContain(customerMoney(d.items[0]!.priceLines[0]!.amount));
  });
  it('hides pending fixed price and does not describe internal confirmation mechanics', () => {
    const c = proposalCalculation(); c.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 1234567, confirmation: 'needsConfirmation', confirmedSubtotalMinor: estimateCalculationVNext(c).subtotalMinor! };
    const markup = html(buildProposalDocumentV2(c)); expect(markup).toContain('Итоговая стоимость требует подтверждения'); expect(markup).not.toContain('client-final'); expect(markup).not.toContain('12 345,67');
  });
  it('preserves nonzero exact digits and document wording without monetary evaluation or rounding', () => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalFinish('manual', Number.MAX_SAFE_INTEGER)]));
    const round = vi.spyOn(money, 'commercialRoundMinor'); const percentage = vi.spyOn(money, 'percentageMinor');
    try { const markup = html(d); expect(markup).toContain('90 071 992 547 409,91 ₽'); expect(round).not.toHaveBeenCalled(); expect(percentage).not.toHaveBeenCalled(); }
    finally { round.mockRestore(); percentage.mockRestore(); }
    const custom = { ...d, summary: { ...d.summary, total: { ...proposalMoneyV2(101), display: 'Точное значение из документа' } } };
    expect(html(custom)).toContain('Точное значение из документа');
  });
  it('has only navigation and image export controls and never mutates the document while rendering', () => {
    const d = buildProposalDocumentV2(proposalCalculation()); const before = JSON.stringify(d); const markup = html(d);
    expect(markup).not.toMatch(/<input|<select|<textarea|<form|<details|<summary/); expect(markup.match(/<button\b/g)).toHaveLength(3);
    expect(markup).toContain('Скачать изображение');
    expect(markup.match(/Вернуться к смете/g)).toHaveLength(2); expect(JSON.stringify(d)).toBe(before);
  });
  it.each(['tilt_turn', 'slidingPercent', 'profileId', 'hardwareId', 'unresolved', 'fixedFinalPrice', 'needsConfirmation', 'purchaseCost', 'installer', 'markup'])('never displays technical/internal %s', (value) => {
    expect(text(html(buildProposalDocumentV2(proposalCalculation())))).not.toContain(value);
  });
  it('keeps Summary entry distinct from the disabled legacy proposal action', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('Показать клиенту'); expect(app).toContain('<button disabled>Сформировать КП</button>');
    expect(app).toContain('<ClientView document={clientDocument}'); expect(app).not.toContain('createProposalDocument(');
  });
});
