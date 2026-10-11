import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PdfExportAction, downloadProposalPdfV2 } from '../src/ui/export/PdfExportAction';
import { ClientView } from '../src/ui/ClientView';
import { pdfReviewDocument } from './fixtures/pdf-v2';

it('exposes PDF beside image/back controls outside customer document content', () => {
  const d = pdfReviewDocument(); const renderer = vi.fn(async () => new Blob());
  const html = renderToStaticMarkup(<ClientView document={d} renderPdf={renderer} onBack={() => {}} />);
  expect(html).toContain('Скачать PDF'); expect(html).toContain('Скачать изображение'); expect(html).toContain('Вернуться к смете');
  expect(html.indexOf('aria-label="Экспорт PDF"')).toBeLessThan(html.indexOf('class="client-header"'));
  expect(renderer).not.toHaveBeenCalled();
  expect(renderToStaticMarkup(<PdfExportAction document={d} renderer={renderer} disabled />)).toContain('<button disabled="">Скачать PDF</button>');
});

it.each([false, true])('releases URL and anchor after browser handoff (failure=%s)', async failure => {
  const link = { href: '', download: '', hidden: false, click: vi.fn(() => { if (failure) throw new Error('Browser handoff failed'); }), remove: vi.fn() };
  const blob = new Blob(['%PDF-'], { type: 'application/pdf' });
  vi.useFakeTimers(); vi.stubGlobal('document', { createElement: () => link, body: { append: vi.fn() } });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-v2');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    const result = downloadProposalPdfV2(blob);
    if (failure) await expect(result).rejects.toThrow('Browser handoff failed');
    else { expect(revoke).not.toHaveBeenCalled(); await vi.runAllTimersAsync(); await result; }
    expect(create).toHaveBeenCalledWith(blob); expect(link.download).toBe('zamerok-offer.pdf');
    expect(link.remove).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:pdf-v2');
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});
