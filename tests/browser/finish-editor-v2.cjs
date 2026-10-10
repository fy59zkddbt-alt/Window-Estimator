// Run against pnpm dev; PLAYWRIGHT_MODULE may point to the host's bundled runtime.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const errors = []; let mobileChecks = 0; let saves = 0; let page;
  const amount = (minor) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);
  try {
    page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    page.on('pageerror', (error) => errors.push(error.message));
    const button = (name) => page.getByRole('button', { name, exact: true });
    const field = (name) => page.getByLabel(name, { exact: true });
    const editor = () => page.locator('.finish-editor');
    const preview = () => page.getByRole('region', { name: 'Текущая цена' });
    const save = () => button('Сохранить замер');
    const persisted = async () => JSON.parse(await page.locator('#persisted-calculation').textContent());
    const totals = async () => JSON.parse(await page.locator('#canonical-totals').textContent());
    async function visit(query = '') {
      await page.goto(`${process.env.FINISH_URL || 'http://127.0.0.1:5173'}/tests/browser/finish-editor-v2.html${query}`);
      await button(query.includes('block=') ? 'Добавить отделку' : 'Добавить замер').waitFor();
    }
    async function open(query = '') { await visit(query); await button('Добавить замер').click(); await button('Отделка окна').click(); await editor().waitFor(); }
    async function number(name, value) { await field(name).fill(String(value)); await field(name).press('Tab'); }
    async function dimensions(depth = 210) {
      await number('Ширина проёма, мм', 1400); await number('Высота проёма, мм', 2100); await number('Фактическая глубина, мм', depth);
    }
    async function mobile() {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow at 375px');
      const rectangles = await editor().locator('input, select, button, summary, a').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).map((node) => node.getBoundingClientRect().toJSON()));
      for (const r of rectangles) { assert.ok(r.height >= 48, `touch target ${r.height}`); assert.ok(r.x >= 0 && r.right <= 375, 'control in viewport'); }
      const columns = await editor().locator('.fields').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).gridTemplateColumns));
      assert.ok(columns.every((value) => !value.includes(' ')), 'one column'); mobileChecks++;
    }
    async function shot(name) {
      if (process.env.FINISH_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.FINISH_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.FINISH_SCREENSHOT_DIR, `${name}-375.png`), fullPage: true });
      }
    }
    async function canonicalSave(id) {
      const text = await preview().innerText(); assert.equal(await save().isEnabled(), true);
      await save().click(); await page.locator('.measurement-card').first().waitFor(); saves++;
      const value = await persisted(); const canonical = await totals();
      assert.equal(value.schemaVersion, 4);
      const line = id ? canonical.measurements.find((line) => line.measurementId === id) : canonical.measurements.at(-1);
      assert.equal(line.kind, 'WindowFinish');
      if (line.basePriceMinor === null) { assert.match(text, /Нужно уточнить цену/); assert.equal(canonical.finalTotalMinor, null); }
      else assert.ok(text.includes(amount(line.basePriceMinor)), 'preview matches Feature 4 saved client price');
      return value.measurements.find((measurement) => measurement.id === line.measurementId);
    }
    for (const [side, work, expected] of [
      ['interior', 'interiorSlopes', ['slope']], ['interior', 'interiorSlopesAndSill', ['slope', 'sill']], ['interior', 'sillOnly', ['sill']],
      ['exterior', 'exteriorSlopes', ['slope']], ['exterior', 'exteriorSlopesAndDrip', ['slope', 'drip']], ['exterior', 'dripOnly', ['drip']],
    ]) {
      await open(); assert.equal(await save().isDisabled(), true);
      assert.equal(await field('Фактическая глубина, мм').inputValue(), '');
      const rect = await field('Фактическая глубина, мм').boundingBox(); assert.ok(rect.y + rect.height < 812, 'primary geometry visible');
      for (const name of ['Ширина проёма, мм', 'Высота проёма, мм', 'Фактическая глубина, мм']) assert.equal(await field(name).getAttribute('inputmode'), 'decimal');
      await dimensions(); await field('Сторона отделки').selectOption(side); await field('Состав работ').selectOption(work);
      const text = await editor().innerText(); assert.equal(text.includes('LATEST MUTABLE MATERIAL'), false);
      assert.equal(await editor().locator('details').first().getAttribute('open'), null);
      await mobile(); await shot(work); const saved = await canonicalSave();
      assert.equal(saved.side, side); assert.equal(saved.workType, work); assert.deepEqual(saved.selections.map((s) => s.element), expected);
      assert.equal(saved.room, 'Без помещения'); assert.equal(saved.name, 'Отделка окна');
      await button('Изменить').click(); const before = await persisted();
      await number('Ширина проёма, мм', 1550); await button('Отмена').click(); assert.deepEqual(await persisted(), before);
      await button('Изменить').click(); await number('Высота проёма, мм', 2200); const edited = await canonicalSave();
      assert.equal(edited.id, saved.id); assert.equal(edited.heightMm, 2200);
    }
    await open(); await dimensions(); await field('Состав работ').selectOption('interiorSlopes');
    for (const [depth, width, id] of [[210, 200, '200'], [220, 200, '200'], ['220,000001', 300, 'a'], [320, 300, 'a']]) {
      await number('Фактическая глубина, мм', depth); assert.match(await editor().innerText(), new RegExp(`Подходящая ширина: ${width} мм`));
      await mobile(); const saved = await canonicalSave();
      const line = (await totals()).measurements[0]; assert.equal(line.result.price.selectedVariants[0].widthVariantId, id);
      assert.equal(line.result.geometry.elements[0].requiredDepthMm, saved.depthMm + 900, 'allowances never drive width selection');
      await button('Изменить').click();
    }
    for (const name of ['Ширина проёма, мм', 'Высота проёма, мм', 'Фактическая глубина, мм']) {
      const old = await field(name).inputValue(); await field(name).fill('1.');
      assert.equal(await save().isDisabled(), true); assert.equal(await preview().locator('.total').count(), 0);
      await field(name).press('Tab'); assert.equal(await save().isDisabled(), true); assert.equal(await preview().locator('.total').count(), 0);
      await number(name, old); assert.equal(await save().isEnabled(), true);
    }
    await number('Фактическая глубина, мм', 340); await mobile(); await shot('unresolved');
    assert.match(await preview().innerText(), /Нужно уточнить цену/); assert.match(await preview().innerText(), /Для глубины 340 мм/);
    assert.equal(await preview().locator('.total').count(), 0);
    const unresolved = await canonicalSave(); assert.equal(unresolved.priceState.mode, 'priceRequiresClarification');
    const unresolvedPrice = (await totals()).measurements[0].result.price;
    assert.equal('costBasis' in unresolvedPrice, false); assert.equal(unresolvedPrice.clientFinishPriceMinor, null);
    await button('Изменить').click(); await button('Указать цену вручную').click();
    for (const text of ['', '0', '-1', '1.001', '90071992547409.92']) {
      await field('Итоговая цена отделки, ₽').fill(text); await button('Применить ручную цену').click();
      assert.match(await preview().innerText(), /Введите цену больше 0/); assert.equal(await save().isDisabled(), true);
    }
    await field('Итоговая цена отделки, ₽').fill('18000,01'); await button('Применить ручную цену').click();
    assert.match(await preview().innerText(), /Цена задана вручную/); await mobile(); await shot('manual');
    const manual = await canonicalSave(); assert.deepEqual(manual.priceState, { mode: 'manual', finalPriceMinor: 1800001, confirmation: 'confirmed' });
    assert.deepEqual((await totals()).measurements[0].result.price, { priceState: manual.priceState, clientFinishPriceMinor: 1800001 });
    await button('Изменить').click();
    for (const [name, changed] of [['Ширина проёма, мм', 1500], ['Высота проёма, мм', 2200], ['Фактическая глубина, мм', 210]]) {
      const old = await field(name).inputValue(); await number(name, changed);
      assert.match(await preview().innerText(), /Параметры изменились/); assert.equal(await preview().locator('.total').count(), 0);
      await number(name, old); assert.match(await preview().innerText(), /Параметры изменились/);
      await button('Подтвердить ручную цену').click(); assert.ok((await preview().innerText()).includes(amount(1800001)));
    }
    await field('Состав работ').selectOption('interiorSlopesAndSill'); assert.match(await preview().innerText(), /Подтвердите ручную цену повторно/);
    await button('Подтвердить ручную цену').click();
    await field('Материал — Подоконник').selectOption('sill-premium'); assert.match(await preview().innerText(), /Параметры изменились/);
    await button('Подтвердить ручную цену').click();
    await number('Фактическая глубина, мм', ''); await number('Фактическая глубина, мм', 340);
    assert.match(await preview().innerText(), /Параметры изменились/); await mobile(); await shot('manual-needs-confirmation');
    const pending = await canonicalSave(); assert.equal(pending.priceState.confirmation, 'needsConfirmation');
    await button('Изменить').click(); assert.match(await preview().innerText(), /Параметры изменились/); await button('Подтвердить ручную цену').click();
    await field('Помещение Необязательно').fill('Спальня'); assert.equal(await button('Подтвердить ручную цену').count(), 0, 'metadata does not invalidate');
    await editor().getByText('Дополнительные работы', { exact: true }).first().click(); await button('Добавить работу').click();
    await field('Название работы 1').fill('Герметизация'); await field('Цена за единицу 1, ₽').fill('125.50');
    assert.match(await preview().innerText(), /Параметры изменились/); await button('Подтвердить ручную цену').click();
    await mobile(); const withWorks = await canonicalSave();
    assert.equal(withWorks.additionalWorks[0].unitPriceMinor, 12550); assert.equal((await totals()).measurements[0].basePriceMinor, 1800001);
    await button('Изменить').click(); await button('Рассчитать автоматически').click(); assert.match(await preview().innerText(), /Нужно уточнить цену/);
    await number('Фактическая глубина, мм', 210); await editor().getByText('Дополнительные параметры', { exact: true }).click();
    await field('Ширина материала — Откосы').selectOption('b'); await mobile();
    const overridden = await canonicalSave(); assert.equal(overridden.selections[0].widthVariantId, 'b');
    assert.equal((await totals()).measurements[0].result.price.selectedVariants[0].widthVariantId, 'b');
    await button('Изменить').click(); await editor().getByText('Дополнительные параметры', { exact: true }).click();
    assert.equal(await field('Ширина материала — Откосы').inputValue(), 'b');
    await field('Ширина материала — Откосы').selectOption(''); const auto = await canonicalSave();
    assert.equal('widthVariantId' in auto.selections[0], false); assert.equal((await totals()).measurements[0].result.price.selectedVariants[0].widthVariantId, '200');
    await open('?missing-exterior'); await dimensions(); await field('Сторона отделки').selectOption('exterior');
    assert.equal(await save().isDisabled(), true); assert.match(await editor().innerText(), /В снимке расчёта нет материала/); await mobile();
    await button('Отмена').click(); assert.equal((await persisted()).measurements.length, 0);
    for (const count of [1, 2]) {
      await visit(`?block=${count}`); const before = await persisted(); await button('Добавить отделку').click();
      assert.equal(await field('Ширина проёма, мм').inputValue(), '2100'); assert.equal(await field('Высота проёма, мм').inputValue(), '2200');
      assert.equal(await field('Фактическая глубина, мм').inputValue(), ''); assert.equal(await save().isDisabled(), true);
      await mobile(); await shot(`bridge-${count}`); await button('Отмена').click(); assert.deepEqual(await persisted(), before);
      await button('Добавить отделку').click(); await number('Фактическая глубина, мм', 210); const created = await canonicalSave();
      const after = await persisted(); assert.equal(after.measurements.length, 2); assert.notEqual(created.id, 'block');
      assert.deepEqual(after.measurements[0], before.measurements[0]); assert.deepEqual(after.configuration.block, before.configuration.block);
      await page.locator('.measurement-card').last().getByRole('button', { name: 'Изменить', exact: true }).click();
      const snapshotBeforeCancel = await persisted(); await number('Ширина проёма, мм', 2400); await number('Фактическая глубина, мм', '');
      await button('Отмена').click(); assert.deepEqual(await persisted(), snapshotBeforeCancel);
      await page.locator('.measurement-card').last().getByRole('button', { name: 'Изменить', exact: true }).click();
      await number('Ширина проёма, мм', 2300); await mobile(); await canonicalSave(created.id);
      assert.deepEqual((await persisted()).measurements[0], before.measurements[0]);
      assert.deepEqual((await persisted()).configuration.block, before.configuration.block);
    }
    assert.deepEqual(errors, []);
    console.log(`Feature 10B browser passed: ${saves} canonical saves/edits; ${mobileChecks} layout/touch checks at 375px; six work types, selection/boundaries/allowances, unresolved/manual/reconfirmation, snapshot, incomplete input, works, cancel and separate block bridge; no browser errors.`);
  } catch (error) { console.error('Browser errors:', errors); console.error('Page:', await page?.locator('body').innerText()); throw error; }
  finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
