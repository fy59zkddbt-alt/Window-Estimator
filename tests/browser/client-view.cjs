// Run against pnpm dev. Browser QA only; no product image/export functionality.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const errors = []; let mobileChecks = 0;
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const view = () => page.getByRole('main', { name: 'Предложение для клиента' });
  const persisted = async () => JSON.parse(await page.locator('#persisted-calculation').textContent());
  const expected = async () => JSON.parse(await page.locator('#canonical-document').textContent());
  const normalized = (value) => value.replace(/\s/g, ' ');
  async function mobile() {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '375px no horizontal overflow');
    const buttons = await view().getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    for (const r of buttons) { assert.ok(r.height >= 48, '48px touch target'); assert.ok(r.x >= 0 && r.right <= 375, 'navigation fits'); }
    assert.equal(await view().locator('input,select,textarea,form,details,summary').count(), 0, 'no editor controls');
    assert.equal(await view().getByRole('button').count(), 2, 'back navigation only');
    const content = await view().innerText();
    assert.doesNotMatch(content, /tilt_turn|slidingPercent|profileId|hardwareId|unresolved|fixedFinalPrice|needsConfirmation|себестоимость|зарплат|наценк|запас 20/i);
    const schemes = await view().locator('svg').evaluateAll((nodes) => nodes.map((node) => ({ scale: node.getAttribute('preserveAspectRatio'), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    for (const scheme of schemes) { assert.equal(scheme.scale, 'xMidYMid meet'); assert.ok(scheme.width > 100 && scheme.width < 375 && scheme.height >= 180); }
    mobileChecks++;
  }
  try {
    for (const scenario of ['ready', 'percent', 'fixed', 'unresolved', 'manual-pending', 'fixed-pending', 'large', 'large-fixed', 'long', 'document-only']) {
      await page.goto(`${process.env.CLIENT_VIEW_URL || 'http://127.0.0.1:5173'}/tests/browser/client-view.html?scenario=${scenario}`);
      if (scenario !== 'document-only') {
        await button('Перейти к смете').click(); await page.getByRole('heading', { name: 'Смета', exact: true }).waitFor();
        assert.equal(await button('Сформировать КП').isDisabled(), true);
      }
      const before = await persisted(); const doc = await expected();
      if (scenario !== 'document-only') await button('Показать клиенту').click();
      await view().waitFor(); await mobile();
      const content = normalized(await view().innerText());
      assert.ok(content.includes(doc.context.clientName)); assert.ok(content.includes(doc.context.objectAddress)); assert.ok(content.includes('Иван Петров'));
      for (const [itemIndex, item] of doc.items.entries()) {
        const card = view().getByRole('article').nth(itemIndex); assert.equal(await card.getAttribute('aria-label'), item.name);
        for (const line of item.priceLines) { assert.ok(normalized(await card.innerText()).includes(normalized(line.amount.display))); assert.ok((await card.innerText()).includes(line.label)); }
        assert.equal(await card.locator('svg').count(), item.schemes.length);
        for (let index = 0; index < item.schemes.length; index++) {
          const actual = await card.locator('svg').nth(index).locator('rect.section').evaluateAll((nodes) => nodes.map((node) => ['x', 'y', 'width', 'height'].map((key) => Number(node.getAttribute(key)))));
          assert.deepEqual(actual, item.schemes[index].geometry.sections.map((s) => [s.xMm, s.yMm, s.widthMm, s.heightMm]), 'ready canonical geometry copied exactly');
        }
      }
      if (doc.summary.total) assert.equal(normalized(await page.getByTestId('client-final').innerText()), `Итого ${normalized(doc.summary.total.display)}`);
      else { assert.equal(await page.getByTestId('client-final').count(), 0); assert.match(content, scenario === 'fixed-pending' ? /Итоговая стоимость требует подтверждения/ : /Цена отделки требует уточнения/); }
      if (scenario === 'percent') assert.ok(content.includes('Скидка 7,25%'));
      if (scenario.startsWith('large')) assert.ok(content.includes(scenario === 'large' ? '90 071 992 547 409,91' : '90 071 992 547 409,89'));
      if (!scenario.startsWith('large')) { assert.ok(content.includes('Демонтаж окна')); assert.ok(content.includes('1,25 пог. м')); assert.ok(content.includes('Доставка')); }
      assert.deepEqual(await persisted(), before);
      if (scenario !== 'document-only') {
        await button('Вернуться к смете').last().click(); await page.getByRole('heading', { name: 'Смета', exact: true }).waitFor();
        assert.deepEqual(await persisted(), before); assert.equal(await button('Сформировать КП').isDisabled(), true);
        await page.evaluate(() => window.feature12.changeGlobalSettings()); await button('Показать клиенту').click(); await view().waitFor();
        assert.equal(normalized(await view().innerText()), content, 'mutable global settings do not alter document');
        await button('Вернуться к смете').first().click(); await page.getByRole('heading', { name: 'Смета', exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.feature12.counts()), { saves: 0, activeChanges: 0, pdfCalls: 0 });
      }
    }
    assert.deepEqual(errors, []);
    console.log(`Feature 12 browser passed: 10 scenarios, ${mobileChecks} layout/touch checks at 375px; all glazing kinds/shapes/mechanisms, exact canonical geometry/money, works, percent/fixed/manual/large/unresolved/pending, serialized document-only rendering, seller, long text, read-only back navigation, global snapshot boundary, disabled PDF; no runtime/console errors.`);
  } catch (error) { console.error('Browser errors:', errors); console.error('Page:', await page.locator('body').innerText()); throw error; }
  finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
