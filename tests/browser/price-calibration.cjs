// Run against pnpm dev. Uses Playwright from the host's bundled runtime or local install.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.CALIBRATION_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${process.env.CALIBRATION_URL || 'http://localhost:5173'}/tests/browser/settings-v2.html?calibration`);
    const button = (name) => page.getByRole('button', { name, exact: true });
    const assistant = () => page.getByRole('main', { name: 'Помощник настройки цен' });
    const saved = async () => JSON.parse(await page.locator('#saved-settings').textContent());
    let layoutChecks = 0;
    async function mobile() {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow at 375px');
      const controls = await assistant().locator('input, select, button').evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().toJSON()));
      for (const rect of controls) { assert.ok(rect.height >= 48); assert.ok(rect.x >= 0 && rect.right <= 375); }
      layoutChecks++;
    }
    async function open(profileId = 'pvc-standard', hardwareId = 'standard') {
      await button('Помочь настроить цены').first().click();
      await assistant().getByLabel('Профиль ПВХ', { exact: true }).selectOption(profileId);
      assert.equal(await button('Ввести цены').isDisabled(), true);
      await assistant().getByLabel('Фурнитура', { exact: true }).selectOption(hardwareId);
      await mobile(); await button('Ввести цены').click(); await mobile();
    }
    const base = () => assistant().getByLabel('Цена глухого белого изделия, ₽', { exact: true });
    const active = () => assistant().getByLabel('Цена открывающегося белого изделия, ₽', { exact: false });
    async function review() { await button('Рассчитать настройки').click(); await mobile(); }
    // Review/back/cancel cannot mutate draft or save.
    await open(); await base().fill('5000'); await active().fill('11250'); await review();
    assert.match(await assistant().innerText(), /\+125%/);
    assert.equal(await page.getByLabel('Сохранённое подтверждение').textContent(), 'Нет сохранений');
    await button('Назад').click(); assert.equal(await base().inputValue(), '5000');
    await review(); await button('Отмена').click();
    assert.equal(await page.getByLabel('Базовая стоимость, ₽/м²', { exact: true }).first().inputValue(), '5700');
    await button('Сохранить настройки').click();
    const initial = await saved(); assert.equal(initial.pricesConfirmed, false);
    // Selected profile and hardware, all independent options; explicit Apply only.
    await open(); await base().fill('5000'); await active().fill('10000');
    await assistant().getByLabel('Вариант ламинации с одной стороны', { exact: true }).selectOption('laminated');
    await assistant().getByLabel('Вариант ламинации с двух сторон', { exact: true }).selectOption('laminated-two');
    await assistant().getByLabel('Цена глухого изделия с ламинацией с одной стороны, ₽', { exact: false }).fill('6000');
    await assistant().getByLabel('Цена глухого изделия с ламинацией с двух сторон, ₽', { exact: false }).fill('6500');
    await assistant().getByLabel('Цена глухого белого изделия с доборами, ₽', { exact: false }).fill('7000');
    await review(); await button('Применить к профилю').click();
    assert.deepEqual(await saved(), initial, 'Apply does not save');
    assert.equal(await page.getByLabel('Базовая стоимость, ₽/м²', { exact: true }).first().inputValue(), '5000');
    await button('Сохранить настройки').click(); const first = await saved();
    assert.equal(first.pricesConfirmed, false); assert.equal(first.glazing.profiles[0].basePricePerM2, 5000);
    assert.deepEqual(first.glazing.profiles[0].hardwareActivity, [{ hardwareId: 'standard', activityPercent: 100 }, { hardwareId: 'premium', activityPercent: 30 }]);
    assert.deepEqual(first.glazing.profiles[0].colorRules, [{ colorId: 'white', colorPercent: 0 }, { colorId: 'laminated', colorPercent: 20 }, { colorId: 'laminated-two', colorPercent: 30 }]);
    assert.deepEqual(first.glazing.profiles.slice(1), initial.glazing.profiles.slice(1));
    assert.equal(first.glazing.profiles[0].productMarkupPercent, 40);
    assert.equal(first.glazing.profiles[0].connectorPercent, 5);
    assert.deepEqual(first.glazing.installationRatesPerM2, initial.glazing.installationRatesPerM2);
    assert.deepEqual(first.finish, initial.finish); assert.deepEqual(first.additionalWorks, initial.additionalWorks);
    // Recalibrating the other hardware preserves Mako and absent options.
    await open('pvc-standard', 'premium'); await base().fill('5000'); await active().fill('15000'); await review();
    await button('Применить к профилю').click(); await button('Сохранить настройки').click(); const second = await saved();
    assert.deepEqual(second.glazing.profiles[0].hardwareActivity, [{ hardwareId: 'standard', activityPercent: 100 }, { hardwareId: 'premium', activityPercent: 200 }]);
    assert.deepEqual(second.glazing.profiles[0].colorRules, first.glazing.profiles[0].colorRules);
    assert.equal(second.glazing.profiles[0].extensionPercent, 40);
    // Selecting a different profile changes only that profile.
    await open('second-profile', 'standard'); await base().fill('7000'); await review();
    await button('Применить к профилю').click(); await button('Сохранить настройки').click(); const third = await saved();
    assert.deepEqual(third.glazing.profiles[0], second.glazing.profiles[0]);
    assert.equal(third.glazing.profiles.at(-1).basePricePerM2, 7000);
    // Invalid negative markup stays in input step and never applies.
    await open(); await base().fill('5000'); await active().fill('4999'); await button('Рассчитать настройки').click();
    assert.match(await assistant().getByRole('alert').textContent(), /цена ниже базовой/);
    assert.equal(await button('Применить к профилю').count(), 0); await button('Отмена').click();
    // Confirmation retains the existing explicit behavior.
    await button('Цены проверены').click(); assert.equal((await saved()).pricesConfirmed, true);
    await open(); await base().fill('5100'); await review(); await button('Применить к профилю').click();
    await button('Сохранить настройки').click(); assert.equal((await saved()).pricesConfirmed, true);
    assert.deepEqual(errors, []);
    console.log(`Feature 7 browser flow passed; ${layoutChecks} mobile layout checks at 375px; no browser errors.`);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
