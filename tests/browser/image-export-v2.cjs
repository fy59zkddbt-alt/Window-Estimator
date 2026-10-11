// Real browser canvas/PNG/download QA. Run against pnpm dev.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = process.env.IMAGE_EXPORT_DIR || path.join(require('node:os').tmpdir(), 'zamerok-image-export-v2');
const normalized = (v) => v.replace(/\s/g, ' ');
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, acceptDownloads: true });
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const base = process.env.IMAGE_EXPORT_URL || 'http://127.0.0.1:5173';
  const goto = async scenario => { await page.goto(`${base}/tests/browser/image-export-v2.html?scenario=${scenario}`); await page.getByRole('button', { name: 'Скачать изображение', exact: true }).waitFor(); };
  const resources = async () => assert.deepEqual(await page.evaluate(() => window.feature13.resources()), { urls: 0, canvasPixels: 0, anchors: 0 });
  try {
    for (const scenario of ['small', 'typical', 'absent', 'all', 'unresolved', 'exact', 'large', 'oversized', 'window-left', 'window-right', 'turn-left', 'turn-right', 'pvc-u', 'aluminium', 'block', 'finish']) {
      await goto(scenario);
      const d = await page.evaluate(() => window.feature13.document);
      const images = await page.evaluate(() => window.feature13.generate());
      assert.ok(images.length > 0); if (scenario === 'small' || scenario === 'absent' || scenario === 'exact') assert.equal(images.length, 1);
      if (scenario === 'typical') assert.ok(images.length <= 2, 'typical four measurements, works, seller and discount: 1–2 images');
      if (scenario === 'large' || scenario === 'oversized') assert.ok(images.length > 2);
      const layout = await page.evaluate(() => window.feature13.layout());
      assert.equal(layout.length, images.length); assert.equal(layout.at(-1).cards.at(-1).card.summary, true);
      if (scenario === 'typical') assert.ok(layout.at(-1).cards.length >= 3, 'finish, works and summary remain together on final page');
      const geometries = layout.flatMap(p => p.cards.flatMap(({card}) => card.atoms.flatMap(a => a.kind === 'schemes' ? a.geometries : [])));
      assert.deepEqual(geometries, d.items.flatMap(i => i.schemes.map(s => s.geometry)));
      assert.equal(await page.evaluate(() => JSON.stringify(window.feature13.document) === window.feature13.original), true);
      for (const [index, image] of images.entries()) {
        assert.equal(image.width, 1080); assert.ok(image.height > 200 && image.height <= 3200); assert.equal(image.type, 'image/png');
        assert.equal(image.filename, images.length === 1 ? 'zamerok-offer.png' : `zamerok-offer-${index + 1}.png`);
        const bytes = Buffer.from(image.base64, 'base64'); assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
        assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), image.height);
        assert.ok(image.inkPixels > 1000, 'every actual PNG contains visible text/drawing ink, no blank page');
        fs.writeFileSync(path.join(output, `${scenario}-${index + 1}.png`), bytes);
      }
      if (d.items.some(i => i.schemes.length)) assert.ok(images.some(i => i.schemePixels > 1000), 'actual PNG contains glazing fill');
      const rectangles = await page.evaluate(() => window.feature13.rectangles());
      assert.equal(rectangles.filter(r => Math.abs(r.weight - 3.2) < 0.01).length, geometries.reduce((sum, g) => sum + g.sections.length + (g.transom ? 1 : 0), 0), 'all window/block/balcony frames actually drawn');
      assert.ok(rectangles.length >= geometries.reduce((sum, g) => sum + 2 * (g.sections.length + (g.transom ? 1 : 0)), 0), 'every frame has a glazing contour');
      for (const r of rectangles) { assert.ok(r.width > 0 && r.height > 0); assert.ok(r.x >= 48 && r.x + r.width <= r.canvasWidth - 48); assert.ok(r.y >= 48 && r.y + r.height <= r.canvasHeight - 48); }
      const paint = await page.evaluate(() => window.feature13.paint());
      for (const line of paint) { assert.ok(line.x >= 48 && line.x + line.width <= 1032.01, `text fits horizontally: ${line.text}`); assert.ok(line.y >= 48 && line.y + line.height <= line.canvasHeight - 48, `text fits vertically: ${line.text}`); }
      const text = normalized(paint.map(p => p.text).join('\n'));
      for (const item of d.items) {
        assert.ok(text.replace(/\s/g, '').includes(item.name.replace(/\s/g, '')), `complete wrapped name: ${item.name}`);
        for (const line of item.priceLines) assert.ok(text.includes(normalized(line.amount.display).replace(/,00(?=\s*₽$)/u, '')));
        assert.doesNotMatch(text, /Секция \d|Верхний ряд|Нижний ряд|Округление суммы|Площадь:|Вид из помещения · мм|Без ламинации|,00\s*₽/);
        if (item.properties.some(p => p.label === 'Материал' && p.value === 'Алюминий')) {
          assert.ok(text.includes('Цвет: Белый'));
        }
      }
      if (d.summary.total) assert.ok(text.includes(normalized(d.summary.total.display).replace(/,00(?=\s*₽$)/u, '')));
      else { assert.match(text, /Цена отделки требует уточнения/); assert.equal(layout.flatMap(p => p.cards.flatMap(c => c.card.atoms)).some(a => a.style === 'final'), false); assert.doesNotMatch(text, /Сумма заказа/); }
      assert.doesNotMatch(text, /себестоимость|зарплат|наценк|profileId|hardwareId|private-work|fixedFinalPrice|tilt_turn/i);
      if (scenario === 'absent') assert.doesNotMatch(text, /Иван Петров|Окна для вас|@okna/); else assert.match(text, /Иван Петров/);
      if (scenario === 'exact') { assert.ok(text.includes('90 071 992 547 409,91 ₽')); assert.ok(text.includes('90 071 992 547 409,89 ₽')); }
      if (scenario === 'aluminium') { assert.doesNotMatch(text, /ламинаци/i); assert.match(text, /Цвет: Белый/); assert.match(text, /Раздвижное/); }
      if (scenario === 'window-left' || scenario === 'window-right') {
        assert.equal(paint.filter(p => p.text.startsWith('Ламинация с')).length, 1);
        assert.ok(paint.some(p => p.text === 'Дополнительно: расширители, соединители'));
      }
      if (scenario === 'finish') assert.doesNotMatch(text, /Итого по позиции|Проём:|глубина/);
      if (['window-left', 'pvc-u', 'aluminium', 'block'].includes(scenario)) await page.screenshot({ path: path.join(output, `${scenario}-client.png`), fullPage: true });
      await resources();
      console.log(`${scenario}: ${images.length} PNG page(s), content/geometry/bounds/resources checked`);
      // Same device font environment: identical pixels at different viewport/DPR.
      if (scenario === 'typical') {
        await page.setViewportSize({ width: 1440, height: 900 }); const desktop = await page.evaluate(() => window.feature13.generate());
        assert.deepEqual(desktop, images); await page.setViewportSize({ width: 375, height: 812 });
      }
    }
    await goto('all'); const expected = await page.evaluate(() => window.feature13.layout().length);
    const downloads = []; page.on('download', d => downloads.push(d));
    const action = page.getByRole('button', { name: 'Скачать изображение', exact: true });
    await action.click(); await page.getByRole('status').filter({ hasText: 'Формируем изображение' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Формируем изображение…', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Формируем изображение…', exact: true }).evaluate(b => { b.click(); b.click(); });
    await action.waitFor(); assert.equal(downloads.length, expected, 'duplicate export blocked');
    for (const [i, d] of downloads.entries()) { assert.equal(d.suggestedFilename(), `zamerok-offer-${i + 1}.png`); await d.saveAs(path.join(output, `ui-${i + 1}.png`)); }
    await resources();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Скачать страницу 2', exact: true }).click(); await action.waitFor();
    assert.equal(downloads.length, expected + 1); assert.equal(downloads.at(-1).suggestedFilename(), 'zamerok-offer-2.png'); await resources();
    await page.evaluate(() => window.feature13.fail(true)); await action.click();
    await page.getByRole('alert').filter({ hasText: 'Не удалось сформировать изображение' }).waitFor(); assert.equal(await action.isEnabled(), true); await resources();
    await page.evaluate(() => window.feature13.fail(false)); await action.click(); await action.waitFor();
    assert.equal(await page.getByRole('alert').count(), 0); await resources();
    await page.getByRole('button', { name: 'Вернуться к смете', exact: true }).first().click(); await page.getByText('Смета', { exact: true }).waitFor();
    // Navigate away mid-export: generator stops and all handoff resources settle.
    await goto('all'); await action.click(); await page.getByRole('button', { name: 'Вернуться к смете', exact: true }).first().click();
    await page.waitForFunction(() => { const r = window.feature13.resources(); return !r.urls && !r.canvasPixels && !r.anchors; });
    assert.deepEqual(errors, []);
    console.log(`Feature 13 browser passed: 16 content/visual scenarios; native PNG bytes/pixels/dimensions, all schemes, exact money/unresolved, deterministic viewport-independent pages, intact/oversized pagination, downloads + per-page fallback, duplicate/progress/failure/recovery/back/cancellation, resource cleanup, no console/runtime errors. PNG review files: ${output}`);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
