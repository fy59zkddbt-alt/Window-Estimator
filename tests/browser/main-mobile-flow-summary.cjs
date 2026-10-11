// Run against pnpm dev. Real active IndexedDB repository, production App, 375px.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = []; let mobileChecks = 0; let saves = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => { if (event.type() === 'error') errors.push(event.text()); });
  const button = (name) => page.getByRole('button', { name, exact: true }).first();
  const field = (name) => page.getByLabel(name, { exact: true });
  const data = async () => JSON.parse(await page.locator('#persisted-calculation').textContent());
  const totals = async () => JSON.parse(await page.locator('#canonical-totals').textContent());
  const card = (name) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const normalized = (value) => value.replace(/\s/g, ' ');
  const money = (minor) => normalized(new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100));
  async function number(name, value) { await field(name).fill(String(value)); await field(name).press('Tab'); }
  async function home() {
    await page.getByRole('heading', { name: 'Ваш расчёт', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('main.calculation-flow > fieldset')?.disabled === false);
  }
  async function back() { await button('К составу расчёта').click(); await home(); }
  async function add(kind) { await button('Добавить замер').click(); await mobile(); await button(kind).click(); }
  async function save() { assert.equal(await button('Сохранить замер').isEnabled(), true); await button('Сохранить замер').click(); await home(); saves++; }
  async function named(name, room = 'Кухня') {
    await page.getByRole('textbox', { name: /^Название/ }).fill(name);
    await page.getByRole('textbox', { name: /^Помещение/ }).fill(room);
  }
  async function mobile() {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '375px has no horizontal overflow');
    const rectangles = await page.locator('main input:not([type=checkbox]), main select, main button, main summary').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length)
      .map((node) => ({ text: node.textContent, ...node.getBoundingClientRect().toJSON() })));
    for (const rectangle of rectangles) { assert.ok(rectangle.height >= 48, `${rectangle.text}: touch target ${rectangle.height}`); assert.ok(rectangle.x >= 0 && rectangle.right <= 375, 'control fits phone'); }
    mobileChecks++;
  }
  async function summary() {
    await button('Перейти к смете').click(); await page.getByRole('heading', { name: 'Смета', exact: true }).waitFor(); await mobile();
    const canonical = await totals(); const content = normalized(await page.getByRole('region', { name: 'Итоги расчёта', exact: true }).innerText());
    if (canonical.measurements.length && canonical.finalTotalMinor !== null) {
      assert.equal(normalized(await page.getByTestId('calculation-final').innerText()), `Итого: ${money(canonical.finalTotalMinor)}`);
    } else assert.equal(await page.getByTestId('calculation-final').count(), 0);
    for (const measurement of canonical.measurements) for (const line of measurement.clientLines) assert.ok(content.includes(money(line.clientPriceMinor)));
    for (const line of canonical.orderAdditionalWorkLines) assert.ok(content.includes(money(line.clientPriceMinor)));
    assert.equal(await button('Скачать PDF').isEnabled(), canonical.measurements.length > 0); return canonical;
  }
  async function remove(name, confirm = true) {
    await card(name).getByRole('button', { name: 'Удалить', exact: true }).click();
    assert.ok(await card(name).getByRole('group', { name: 'Подтверждение удаления' }).isVisible());
    await button(confirm ? 'Да, удалить замер' : 'Оставить замер').click();
    if (confirm) await card(name).waitFor({ state: 'detached' });
  }
  async function screenshot(name) {
    if (!process.env.FLOW_SCREENSHOT_DIR) return;
    fs.mkdirSync(process.env.FLOW_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.FLOW_SCREENSHOT_DIR, name), fullPage: true });
  }
  try {
    await page.goto(`${process.env.FLOW_URL || 'http://127.0.0.1:5173'}/tests/browser/main-mobile-flow-summary.html?case=${Date.now()}`);
    await button('Создать расчёт').click(); await home(); await mobile();
    let value = await data(); const id = value.id;
    assert.equal(value.schemaVersion, 4); assert.deepEqual(value.measurements, []);
    assert.deepEqual(value.settingsSnapshot, await page.evaluate(() => window.feature11.currentSettings()));
    await summary(); assert.equal(await page.getByTestId('calculation-final').count(), 0); await back();
    await field('Имя клиента').fill('Анна Иванова'); await field('Телефон').fill('+7 900 1234567'); await field('Адрес объекта').fill('Новосибирск, Ленина, 7');
    await button('Сохранить данные клиента').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#persisted-calculation').textContent).clientName === 'Анна Иванова');
    assert.equal((await data()).objectAddress, 'Новосибирск, Ленина, 7');
    await add('Окно'); assert.equal(await button('Сохранить замер').isDisabled(), true); await named('Окно спальни', 'Спальня');
    await field('Тип окна').selectOption('double'); await number('Общая ширина, мм', 1400); await number('Высота, мм', 1500);
    await field('Секция 1: открывание').selectOption('tilt_turn');
    await page.getByText('Дополнительные работы', { exact: true }).first().click(); await button('Добавить работу').click();
    await field('Название работы 1').fill('Демонтаж окна'); await field('Цена за единицу 1, ₽').fill('123.45'); await save();
    const windowId = (await data()).measurements[0].id; assert.ok((await card('Окно спальни').innerText()).includes('1400 × 1500')); await mobile();
    await add('Балкон'); await named('Лоджия', 'Балкон'); await number('Ширина плоскости, мм', 2800); await number('Высота плоскости, мм', 1600); await save();
    const balconyId = (await data()).measurements[1].id; assert.match(await card('Лоджия').innerText(), /Прямой.*ПВХ/);
    await add('Балконный блок'); assert.equal(await field('Тип окна').inputValue(), 'balconyBlock'); await named('Блок кухни');
    await number('Ширина оконной части, мм', 1400); await number('Ширина двери, мм', 700); await number('Высота окна, мм', 1500); await number('Высота двери, мм', 2200); await field('Положение двери').selectOption('right'); await save();
    const blockId = (await data()).measurements[2].id; assert.match(await card('Блок кухни').innerText(), /Дверь 700 × 2200/);
    await add('Отделка окна'); await named('Отделка кухни'); await number('Ширина проёма, мм', 1400); await number('Высота проёма, мм', 1500); await number('Фактическая глубина, мм', 210); await save();
    const finishId = (await data()).measurements[3].id; assert.match(await card('Отделка кухни').innerText(), /автоматически/);
    // Explicit order-work save: draft preview never changes the current total.
    const beforeWorks = await totals();
    await page.locator('.order-works > summary').click(); await field('Работа из каталога').selectOption('delivery'); await button('Добавить выбранную работу').click();
    await field('Количество 1').fill('1.25'); assert.equal((await totals()).finalTotalMinor, beforeWorks.finalTotalMinor);
    await field('Количество 1').fill('0'); assert.equal(await button('Сохранить работы по заказу').isDisabled(), true);
    await field('Количество 1').fill('1.25'); await mobile(); await button('Сохранить работы по заказу').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#persisted-calculation').textContent).orderAdditionalWorks.length === 1);
    assert.equal((await data()).orderAdditionalWorks[0].quantity, 1.25); assert.equal((await data()).measurements[0].additionalWorks[0].name, 'Демонтаж окна');
    await screenshot('home-375.png');
    let canonical = await summary(); assert.equal(canonical.measurements.length, 4);
    assert.match(await page.getByRole('region', { name: 'Итоги расчёта', exact: true }).innerText(), /Изделие[\s\S]*Монтаж[\s\S]*Отделка под ключ/);
    assert.equal(canonical.orderAdditionalWorkLines[0].location.scope, 'order');
    await field('Режим скидки').selectOption('percent'); await field('Скидка, %').fill('7.25'); await button('Применить и сохранить').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#canonical-totals').textContent).discountMode === 'percent');
    canonical = await totals(); assert.equal(normalized(await page.getByTestId('calculation-final').innerText()), `Итого: ${money(canonical.finalTotalMinor)}`);
    await screenshot('summary-375.png'); await back();
    // All editors preserve IDs and positions; cancel is a true no-op for new/edit.
    const beforeCancel = await data(); await add('Окно'); await number('Общая ширина, мм', 999); await button('Отмена').click(); await home(); assert.deepEqual(await data(), beforeCancel);
    await card('Окно спальни').getByRole('button', { name: 'Изменить', exact: true }).click(); await number('Высота, мм', 1900); await button('Отмена').click(); await home(); assert.deepEqual(await data(), beforeCancel);
    await card('Окно спальни').getByRole('button', { name: 'Изменить', exact: true }).click(); await number('Высота, мм', 1700); await save();
    assert.equal((await data()).measurements[0].id, windowId); assert.equal((await data()).measurements[0].heightMm, 1700); assert.notEqual((await totals()).subtotalMinor, canonical.subtotalMinor);
    await summary(); await back();
    await card('Лоджия').getByRole('button', { name: 'Изменить', exact: true }).click(); await number('Высота плоскости, мм', 1700); await save(); assert.equal((await data()).measurements[1].id, balconyId);
    await card('Блок кухни').getByRole('button', { name: 'Изменить', exact: true }).click(); await number('Высота двери, мм', 2300); await save(); assert.equal((await data()).measurements[2].id, blockId);
    await card('Отделка кухни').getByRole('button', { name: 'Изменить', exact: true }).click(); await button('Указать цену вручную').click(); await field('Итоговая цена отделки, ₽').fill('1234.56'); await button('Применить ручную цену').click(); await save();
    assert.equal((await data()).measurements[3].id, finishId); assert.equal((await totals()).measurements[3].measurementTotalMinor, 123456); assert.match(await card('Отделка кухни').innerText(), /вручную/);
    await summary(); assert.ok(normalized(await card('Отделка кухни').innerText()).includes(money(123456)));
    await field('Режим скидки').selectOption('fixedFinalPrice'); await field('Итоговая цена, ₽').fill('999999999'); assert.equal(await button('Применить и сохранить').isDisabled(), true);
    await field('Итоговая цена, ₽').fill('12345.67'); await button('Применить и сохранить').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#canonical-totals').textContent).finalTotalMinor === 1234567);
    assert.ok(normalized(await page.getByTestId('calculation-final').innerText()).includes(money(1234567))); await back();
    await card('Окно спальни').getByRole('button', { name: 'Изменить', exact: true }).click(); await save(); assert.equal((await totals()).finalTotalMinor, null);
    await summary(); assert.equal(await page.getByTestId('calculation-final').count(), 0); await button('Оставить итоговую цену').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#canonical-totals').textContent).finalTotalMinor === 1234567); await back();
    // Unresolved finish retains persistence, identifies the item, and withholds all final totals.
    await card('Отделка кухни').getByRole('button', { name: 'Изменить', exact: true }).click(); await button('Рассчитать автоматически').click(); await number('Фактическая глубина, мм', 9999); await save();
    assert.equal((await totals()).pricingStatus, 'unresolved'); assert.equal(await page.getByTestId('calculation-final').count(), 0);
    assert.match(await card('Отделка кухни').innerText(), /Нужно уточнить цену отделки/); assert.equal(await card('Отделка кухни').locator('.card-price').count(), 0);
    await summary(); await screenshot('unresolved-summary-375.png'); assert.equal(await field('Режим скидки').count(), 0); await back();
    await card('Отделка кухни').getByRole('button', { name: 'Изменить', exact: true }).click(); await number('Фактическая глубина, мм', 210); await save();
    assert.equal((await totals()).pricingStatus, 'priced'); await summary(); await button('Оставить итоговую цену').click(); await back();
    await card('Отделка кухни').getByRole('button', { name: 'Изменить', exact: true }).click(); await number('Фактическая глубина, мм', 9999); await save(); await remove('Отделка кухни');
    assert.equal((await totals()).pricingStatus, 'priced'); await summary(); await button('Сбросить').click(); await back();
    assert.deepEqual((await data()).measurements.map((item) => item.id), [windowId, balconyId, blockId]);
    // Add Finish remains independent in both deletion directions.
    await card('Блок кухни').getByRole('button', { name: 'Добавить отделку', exact: true }).click(); await named('Отделка блока'); await number('Фактическая глубина, мм', 210); await save();
    await remove('Отделка блока', false); assert.equal((await data()).measurements.length, 4); await remove('Отделка блока'); assert.ok((await data()).measurements.some((item) => item.id === blockId));
    await card('Блок кухни').getByRole('button', { name: 'Добавить отделку', exact: true }).click(); await named('Независимая отделка'); await number('Фактическая глубина, мм', 210); await save();
    const beforeRemove = (await totals()).subtotalMinor; await remove('Блок кухни'); assert.equal(await card('Независимая отделка').count(), 1); assert.ok((await totals()).subtotalMinor < beforeRemove);
    // Quantity edit/removal and custom canonical work; failed save preserves persisted data and editable draft.
    await page.locator('.order-works > summary').click(); await field('Количество 1').fill('2.5'); await button('Сохранить работы по заказу').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#persisted-calculation').textContent).orderAdditionalWorks[0].quantity === 2.5);
    await button('Удалить работу 1').click(); await button('Добавить работу').click(); await field('Название работы 1').fill('Вывоз мусора'); await field('Цена за единицу 1, ₽').fill('499.99'); await field('Количество 1').fill('0.5');
    const beforeFailure = await data(); await page.evaluate(() => window.feature11.failNextSave()); await button('Сохранить работы по заказу').click();
    await page.getByRole('alert').filter({ hasText: 'Не удалось сохранить расчёт' }).waitFor(); assert.deepEqual(await data(), beforeFailure); assert.equal(await field('Количество 1').inputValue(), '0.5');
    await button('Сохранить работы по заказу').click(); await page.waitForFunction(() => JSON.parse(document.querySelector('#persisted-calculation').textContent).orderAdditionalWorks[0].name === 'Вывоз мусора');
    await button('Удалить работу 1').click(); await button('Сохранить работы по заказу').click(); await page.waitForFunction(() => JSON.parse(document.querySelector('#persisted-calculation').textContent).orderAdditionalWorks.length === 0);
    // Metadata preserves all pricing and persists through a real repository reload.
    if (await page.locator('.client-details').getAttribute('open') === null) await page.locator('.client-details > summary').click();
    const beforeDetails = await data(); await field('Адрес объекта').fill('Обновлённый адрес'); await button('Сохранить данные клиента').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#persisted-calculation').textContent).objectAddress === 'Обновлённый адрес');
    assert.deepEqual((await data()).measurements, beforeDetails.measurements); assert.deepEqual((await data()).configuration, beforeDetails.configuration);
    await page.reload(); await home(); assert.equal((await data()).id, id); assert.equal((await data()).objectAddress, 'Обновлённый адрес'); assert.equal(await page.evaluate(() => window.feature11.otherOwnerCount()), 0);
    const historicalTotals = await totals(); const historicalSnapshot = (await data()).settingsSnapshot;
    await page.evaluate(() => window.feature11.updateGlobalSettings()); await page.locator('.calculation-menu > summary').click(); await button('Настройки калькулятора').click();
    await button('Загрузить актуальные настройки').click(); await page.getByText('Актуальные настройки загружены.', { exact: true }).waitFor(); await button('К расчётам без сохранения').click(); await home();
    assert.deepEqual(await totals(), historicalTotals); assert.deepEqual((await data()).settingsSnapshot, historicalSnapshot); await summary(); await back();
    const menu = page.locator('.calculation-menu'); if (!(await menu.getAttribute('open') !== null)) await menu.locator('summary').click();
    await button('Новый расчёт').click(); await page.waitForFunction((oldId) => JSON.parse(document.querySelector('#persisted-calculation').textContent).id !== oldId, id);
    value = await data(); assert.deepEqual(value.measurements, []); assert.equal(value.settingsSnapshot.glazing.profiles[0].basePricePerM2, 999999); assert.equal(value.settingsSnapshot.additionalWorks[0].unitPriceMinor, 999999);
    await add('Окно'); assert.ok((await field('Профиль').innerText()).includes('Новый глобальный профиль')); await button('Отмена').click(); await home();
    await page.locator('.calculation-menu > summary').click(); await field('Сохранённые расчёты').selectOption(id); await home(); await page.waitForFunction((oldId) => JSON.parse(document.querySelector('#persisted-calculation').textContent).id === oldId, id);
    assert.deepEqual(await totals(), historicalTotals); await mobile(); assert.deepEqual(errors, []);
    console.log(`Feature 11 browser passed: ${saves} editor saves, ${mobileChecks} layout/touch checks at 375px; new v4, metadata, four editors, cancel/edit/remove/order, separate works and decimal quantities, canonical summary/discount/fixed/manual/unresolved, repository failure/reload/owner and snapshot boundaries; no console/runtime errors.`);
  } catch (error) { console.error('Browser errors:', errors); console.error('Page:', await page.locator('body').innerText()); throw error; }
  finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
