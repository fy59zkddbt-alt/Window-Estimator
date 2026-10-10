// Run against pnpm dev; PLAYWRIGHT_MODULE may point at the host's bundled runtime.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  let mobileChecks = 0; let saves = 0;
  const errors = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    page.on('pageerror', (e) => errors.push(e.message));
    const button = (name) => page.getByRole('button', { name, exact: true });
    const field = (name) => page.getByLabel(name, { exact: true });
    const persisted = async () => JSON.parse(await page.locator('#persisted-calculation').textContent());
    const editor = () => page.locator('.glazing-editor');
    const save = () => button('Сохранить замер');
    const widths = async () => editor().getByRole('textbox', { name: /Ширина секции/ }).evaluateAll((nodes) => nodes.map((n) => n.value));
    async function number(name, value) { await field(name).fill(String(value)); await field(name).press('Tab'); }
    async function mobile() {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow at 375px');
      const rectangles = await editor().locator('input:not([type=checkbox]), select, button, summary').evaluateAll((nodes) => nodes.filter((n) => n.getClientRects().length).map((n) => n.getBoundingClientRect().toJSON()));
      for (const r of rectangles) { assert.ok(r.height >= 48, `touch target ${r.height}`); assert.ok(r.x >= 0 && r.right <= 375, 'control within viewport'); }
      mobileChecks++;
    }
    async function open(kind = 'Окно') {
      await page.goto(`${process.env.GLAZING_URL || 'http://127.0.0.1:5173'}/tests/browser/glazing-editors-v2.html`);
      await button('Добавить замер').click(); await button(kind).click(); await mobile();
      await editor().waitFor();
      console.log(`Opened ${kind}`);
    }
    async function windowDimensions(width = 1400) { await number('Общая ширина, мм', width); await number('Высота, мм', 1500); }
    async function canonicalSave() {
      const previewText = await page.getByRole('region', { name: 'Текущая цена' }).innerText();
      assert.equal(await save().isEnabled(), true); await save().click(); await button('Изменить').waitFor(); saves++;
      const value = await persisted();
      assert.equal(value.schemaVersion, 4); assert.equal(value.measurements.length, 1);
      const total = Number(await page.locator('#canonical-total').textContent());
      assert.ok(previewText.includes(new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(total / 100)), 'preview matches canonical saved totals');
      return value.measurements[0];
    }
    for (const type of ['single', 'double', 'triple']) {
      await open(); assert.equal(await save().isDisabled(), true);
      await field('Тип окна').selectOption(type); await windowDimensions(type === 'triple' ? 1800 : 1400);
      assert.equal(await editor().getByRole('textbox', { name: /Ширина секции/ }).last().getAttribute('readonly'), '');
      if (type !== 'single') {
        const before = await widths();
        await field('Ширина секции 1, мм').fill(type === 'double' ? '800' : '700');
        assert.equal(await save().isDisabled(), true, 'pending input suppresses stale pricing/save');
        await field('Ширина секции 1, мм').press('Tab');
        if (type === 'triple') {
          assert.deepEqual(await widths(), ['700', '500', '600']);
          await number('Ширина секции 2, мм', 550); assert.deepEqual(await widths(), ['700', '550', '550']);
        } else assert.deepEqual(await widths(), ['800', '600']);
        const valid = await widths(); await number('Ширина секции 1, мм', 99999);
        assert.deepEqual(await widths(), valid); assert.match(await editor().innerText(), /Ширина недопустима/);
        await number('Общая ширина, мм', 1501);
        assert.deepEqual(await widths(), type === 'triple' ? ['501', '500', '500'] : ['751', '750']);
        assert.ok(before.length > 1);
      }
      for (const opening of ['turn', 'tilt_turn', 'fixed']) {
        await field('Секция 1: открывание').selectOption(opening); assert.equal(await save().isEnabled(), true);
      }
      await field('Секция 1: открывание').selectOption('tilt_turn');
      assert.equal(await field('Секция 1: фурнитура').inputValue(), 'standard');
      assert.ok((await field('Профиль').innerText()).includes('VEKA Softline 70'));
      assert.equal((await editor().innerText()).includes('LATEST MUTABLE PROFILE'), false);
      await field('Профиль').selectOption('scoped');
      assert.equal(await field('Секция 1: фурнитура').inputValue(), 'premium');
      assert.deepEqual(await field('Секция 1: фурнитура').locator('option').evaluateAll((options) => options.map((o) => o.value)), ['', 'premium']);
      await field('Ламинация').selectOption('laminated'); await field('Ламинация').selectOption('laminated-two');
      await editor().getByText('Дополнительные параметры', { exact: true }).click();
      await field('Доборы').check(); await field('Соединители').check();
      await editor().getByText('Дополнительные работы', { exact: true }).first().click(); await button('Добавить работу').click();
      await field('Название работы 1').fill('Подъём'); await field('Цена за единицу 1, ₽').fill('125.50');
      await mobile(); const saved = await canonicalSave();
      assert.equal(saved.windowType, type); assert.equal(saved.colorId, 'laminated-two'); assert.equal(saved.extensions, true); assert.equal(saved.connectors, true);
      assert.equal(saved.additionalWorks[0].unitPriceMinor, 12550);
      const beforeEdit = await persisted(); await button('Изменить').click();
      await number('Высота, мм', 1700); await button('Отмена').click(); assert.deepEqual(await persisted(), beforeEdit, 'cancel never persists partial edit');
      await button('Изменить').click(); await number('Высота, мм', 1600); const edited = await canonicalSave();
      assert.equal(edited.id, saved.id); assert.deepEqual(edited.additionalWorks, saved.additionalWorks); assert.equal(edited.colorId, saved.colorId);
    }
    // Small widths reject count changes; temporary block/rectangle switching
    // respects the explicit requested type and never persists hidden drafts.
    await open(); await windowDimensions(1); await field('Тип окна').selectOption('triple');
    assert.equal(await field('Тип окна').inputValue(), 'single'); assert.match(await editor().innerText(), /Недостаточная ширина/);
    await number('Общая ширина, мм', 1400); await field('Тип окна').selectOption('double');
    await field('Тип окна').selectOption('balconyBlock'); await field('Секции оконной части').selectOption('2');
    await number('Ширина оконной части, мм', 1200); await number('Ширина двери, мм', 700);
    await number('Высота окна, мм', 1500); await number('Высота двери, мм', 2200); await field('Положение двери').selectOption('right');
    await field('Секция 2: открывание').selectOption('tilt_turn'); await field('Секции оконной части').selectOption('1');
    await field('Профиль').selectOption('scoped'); await field('Секции оконной части').selectOption('2');
    assert.equal(await field('Секция 2: открывание').inputValue(), 'tilt_turn'); assert.equal(await field('Секция 2: фурнитура').inputValue(), 'premium');
    await field('Тип окна').selectOption('single'); assert.equal(await field('Тип окна').inputValue(), 'single');
    assert.equal(await field('Общая ширина, мм').inputValue(), '1400');
    await field('Тип окна').selectOption('balconyBlock'); assert.equal(await field('Ширина двери, мм').inputValue(), '700');
    await mobile(); const unsaved = await persisted(); await button('Отмена').click(); assert.deepEqual(await persisted(), unsaved);
    assert.equal(unsaved.measurements.length, 0);
    for (const count of ['1', '2']) {
      await open(); await field('Тип окна').selectOption('balconyBlock');
      await field('Секции оконной части').selectOption(count);
      await number('Ширина оконной части, мм', 1400); await number('Ширина двери, мм', 700);
      await number('Высота окна, мм', 1500); await number('Высота двери, мм', 2200);
      assert.equal(await save().isDisabled(), true, 'door position must be explicit');
      await field('Положение двери').selectOption('right');
      if (count === '2') { await number('Ширина секции 1, мм', 800); assert.deepEqual(await widths(), ['800', '600']); }
      assert.equal(await field('Ширина двери, мм').inputValue(), '700');
      await field('Дверь: открывание').selectOption('turn'); await field('Профиль').selectOption('scoped');
      assert.equal(await field('Дверь: фурнитура').inputValue(), 'premium');
      await mobile(); const saved = await canonicalSave();
      assert.equal(saved.windowType, 'balconyBlock'); assert.equal(saved.plane.sections.length, Number(count));
      assert.equal(saved.doorWidthMm, 700); assert.equal(saved.windowHeightMm, 1500); assert.equal(saved.doorHeightMm, 2200);
      assert.equal('widthMm' in saved.door, false);
      await button('Изменить').click(); await number('Ширина оконной части, мм', 1600); await mobile();
      const edited = await canonicalSave(); assert.equal(edited.id, saved.id); assert.equal(edited.doorWidthMm, 700);
    }
    for (const shape of ['straight', 'L', 'U']) {
      await open('Балкон'); await field('Форма балкона').selectOption(shape);
      const planes = shape === 'straight' ? ['Фасад'] : shape === 'L' ? ['Левая сторона', 'Фасад'] : ['Левая сторона', 'Фасад', 'Правая сторона'];
      for (const name of planes) {
        await button(name).click(); await number('Ширина плоскости, мм', name === 'Фасад' ? 1800 : 1200); await number('Высота плоскости, мм', 2100);
        await field('Количество секций').selectOption('3'); await number('Ширина секции 1, мм', name === 'Фасад' ? 700 : 450);
        await field('Секция 1: открывание').selectOption('turn'); await mobile();
      }
      await button('Фасад').click(); assert.deepEqual(await widths(), ['700', '500', '600']);
      await field('Ярусность').selectOption('twoLevel'); assert.equal(await field('Высота нижнего яруса от низа, мм').inputValue(), '');
      assert.equal(await save().isDisabled(), true); await number('Высота нижнего яруса от низа, мм', 800); await field('Нижнее заполнение').selectOption('sandwich');
      await number('Ширина секции 2, мм', 550); assert.equal(await field('Высота нижнего яруса от низа, мм').inputValue(), '800');
      await mobile(); const saved = await canonicalSave();
      assert.equal(saved.balconyType, shape); assert.equal(saved.planes.length, planes.length);
      assert.equal(saved.planes.find((p) => p.position === 'facade').levels.splitHeightMm, 800);
      await button('Изменить').click(); await button('Фасад').click(); await number('Высота плоскости, мм', 2200);
      const edited = await canonicalSave(); assert.equal(edited.id, saved.id);
      assert.deepEqual(edited.planes.filter((p) => p.position !== 'facade'), saved.planes.filter((p) => p.position !== 'facade'));
    }
    await open('Балкон'); await field('Форма балкона').selectOption('U'); await field('Материал').selectOption('aluminium');
    assert.equal(await editor().getByText(/фурнитура/).count(), 0);
    for (const [name, mode] of [['Левая сторона', 'sliding'], ['Фасад', 'swing'], ['Правая сторона', 'sliding']]) {
      await button(name).click(); await number('Ширина плоскости, мм', 1800); await number('Высота плоскости, мм', 2100);
      await field('Количество секций').selectOption('3'); await field('Тип открывания').selectOption(mode);
      const options = await field('Секция 1: открывание').locator('option').evaluateAll((nodes) => nodes.map((o) => o.value));
      assert.deepEqual(options, mode === 'sliding' ? ['fixed', 'sliding'] : ['fixed', 'turn']);
      await field('Секция 1: открывание').selectOption(mode === 'sliding' ? 'sliding' : 'turn');
      assert.equal(await editor().getByText(/фурнитура/).count(), 0); await mobile();
    }
    await button('Фасад').click(); await field('Ярусность').selectOption('twoLevel'); await number('Высота нижнего яруса от низа, мм', 800);
    await field('Нижнее заполнение').selectOption('sandwich'); await number('Ширина секции 1, мм', 700);
    const shotDir = process.env.GLAZING_SCREENSHOT_DIR;
    if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, 'glazing-editor-aluminium-375.png'), fullPage: true }); }
    const savedAluminium = await canonicalSave();
    assert.deepEqual(savedAluminium.planes.map((p) => p.mode), ['sliding', 'swing', 'sliding']);
    for (const plane of savedAluminium.planes) for (const section of plane.sections) assert.equal('hardwareId' in section, false);
    await button('Изменить').click(); await button('Фасад').click(); assert.equal(await field('Тип открывания').inputValue(), 'swing');
    assert.equal(await field('Высота нижнего яруса от низа, мм').inputValue(), '800'); await mobile();
    assert.deepEqual(errors, []);
    console.log(`Feature 10A browser passed: ${saves} canonical saves/edits; ${mobileChecks} layout/touch checks at 375px; cancel/snapshot/widths/openings/levels/additional works verified; no browser errors.`);
  } catch (error) {
    console.error('Browser errors:', errors);
    console.error('Page:', await page?.locator('body').innerText());
    throw error;
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
