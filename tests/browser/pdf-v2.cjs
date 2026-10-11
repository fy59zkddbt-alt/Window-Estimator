// Real browser bytes, downloads, progress/duplicate/failure/retry/navigation and resource QA.
// pnpm dev, then PLAYWRIGHT_MODULE=<bundled playwright> node tests/browser/pdf-v2.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const output = path.resolve('review-artifacts/feature-14');
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const goto = scenario => page.goto(`http://127.0.0.1:5173/tests/browser/pdf-v2.html?scenario=${scenario}`);
  const action = () => page.getByRole('button', { name: 'Скачать PDF', exact: true });
  const resources = async () => {
    await page.waitForFunction(() => { const r = window.feature14.resources(); return r.urls === 0 && r.anchors === 0; }, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => window.feature14.resources()), { urls: 0, anchors: 0 });
  };
  const downloads = []; page.on('download', d => downloads.push(d));
  try {
    for (const scenario of ['window', 'pvc-u', 'aluminium', 'full', 'exact', 'unresolved']) {
      await goto(scenario); await action().waitFor();
      const bytes = Buffer.from(await page.evaluate(() => window.feature14.generate()));
      assert.equal(bytes.toString('ascii', 0, 5), '%PDF-'); assert.ok(bytes.length > 10000);
      assert.equal(bytes.includes(Buffer.from('/Subtype /Image')), false, 'no raster page or scheme');
      fs.writeFileSync(path.join(output, `${scenario}.pdf`), bytes);
      const layout = await page.evaluate(() => window.feature14.layout());
      fs.writeFileSync(path.join(output, `${scenario}.json`), JSON.stringify({ ...await page.evaluate(() => window.feature14.manifest()), pages: layout.length }, null, 2));
      assert.ok(layout.length > 0); assert.equal(layout.at(-1).cards.at(-1).card.summary, true);
      for (const p of layout) for (const {card, y} of p.cards) { assert.ok(y >= 16); assert.ok(y + card.height <= 281); }
      if (scenario === 'window' || scenario === 'pvc-u') assert.equal(layout.length, 1);
      if (scenario === 'full') {
        assert.equal(layout.length, 2, 'representative content fits two pages without changing fonts/schemes');
        const last = layout[0].cards.at(-1);
        assert.ok(last.y + last.card.height > 269, 'use the lower page area for the next balcony scheme group');
        assert.ok(last.card.blocks.some(b => b.rows.some(r => r.kind === 'schemes')));
        assert.equal(layout[1].cards[0].card.continuation, true);
        const summaries = layout.flatMap(p => p.cards).filter(c => c.card.summary);
        assert.equal(summaries.length, 1); assert.equal(summaries[0].card.blocks.length, 1);
        assert.equal(summaries[0].card.continuation, false);
      }
      const original = await page.evaluate(() => window.feature14.original);
      assert.equal(await page.evaluate(() => JSON.stringify(window.feature14.document)), original);
      await page.setViewportSize({ width: 1440, height: 900 });
      assert.deepEqual(await page.evaluate(() => window.feature14.layout()), layout);
      await page.setViewportSize({ width: 375, height: 812 });
      await resources(); console.log(`${scenario}: ${layout.length} PDF page(s), real vectors/font/bytes, viewport-independent bounded layout`);
    }
    await goto('full'); await action().waitFor();
    await page.evaluate(() => window.feature14.hold()); await action().click();
    await page.getByRole('status').filter({ hasText: 'Формируем PDF…' }).waitFor();
    const running = page.getByRole('button', { name: 'Формируем PDF…', exact: true }); assert.equal(await running.isDisabled(), true);
    await page.waitForFunction(() => window.feature14.counts().calls === 1);
    await running.evaluate(button => { button.click(); button.click(); });
    await page.evaluate(() => window.feature14.release()); await action().waitFor();
    assert.equal(downloads.length, 1); assert.equal(downloads[0].suggestedFilename(), 'zamerok-offer.pdf');
    await downloads[0].saveAs(path.join(output, 'download.pdf')); await resources();
    await page.evaluate(() => window.feature14.fail(true)); await action().click();
    await page.getByRole('alert').filter({ hasText: 'Не удалось сформировать PDF. Попробуйте ещё раз.' }).waitFor();
    assert.equal(await action().isEnabled(), true); assert.ok(await page.getByRole('heading', { name: 'Остекление квартиры' }).isVisible());
    await resources(); await page.evaluate(() => window.feature14.fail(false)); await action().click(); await action().waitFor();
    assert.equal(downloads.length, 2); assert.equal(await page.getByRole('alert').count(), 0); await resources();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // Use a real React unmount through App for navigation during generation below.
    await goto('app'); await page.getByRole('button', { name: 'Перейти к смете', exact: true }).click();
    await action().waitFor(); const before = await page.evaluate(() => window.feature14.counts());
    await action().click(); await action().waitFor(); await resources();
    const after = await page.evaluate(() => window.feature14.counts());
    assert.equal(after.calls, before.calls + 1); assert.equal(after.settingsReads, before.settingsReads); assert.equal(after.saves, 0);
    await page.getByRole('button', { name: 'Показать клиенту', exact: true }).click(); await action().waitFor();
    await page.evaluate(() => window.feature14.hold()); const downloaded = downloads.length; await action().click();
    await page.waitForFunction(() => window.feature14.counts().calls === 2);
    await page.getByRole('button', { name: 'Вернуться к смете', exact: true }).first().click();
    await page.evaluate(() => window.feature14.release());
    await page.getByRole('heading', { name: 'Смета', exact: true }).waitFor(); await resources();
    assert.equal(downloads.length, downloaded); assert.deepEqual(errors, []);
    console.log('Feature 14 browser passed: native download, duplicate guard, progress, failure/retry, DTO preservation, no mutable pricing Settings reads/writes, unmount cancellation, resource cleanup, 375px controls. Review PDFs: ' + output);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
