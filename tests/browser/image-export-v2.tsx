import { createRoot } from 'react-dom/client';
import { ClientView } from '../../src/ui/ClientView';
import { buildProposalDocumentV2 } from '../../src/application/documents/build-proposal-document-v2';
import { estimateCalculationVNext } from '../../src/application/estimate/estimate-calculation-vnext';
import { proposalCalculation, proposalWindow, proposalBalcony, proposalBlock, proposalFinish } from '../fixtures/proposal-v2';
import { imageFont, layoutProposalImages } from '../../src/ui/export/proposal-image-layout';
import { renderProposalImages } from '../../src/ui/export/render-proposal-images';
import '../../src/ui/styles.css';

const scenario = new URLSearchParams(location.search).get('scenario') || 'typical';
function visualWindow(side: 'left' | 'right', opening: 'turn' | 'tilt_turn' = 'tilt_turn') {
  const window = proposalWindow();
  if (window.windowType === 'double') {
    delete window.transom;
    window.plane.sections = window.plane.sections.map((s) => s.openingType === 'fixed' ? s : { ...s, openingType: opening, hingeSide: side });
  }
  return window;
}
function visualBalcony() {
  const balcony = proposalBalcony('U', 'pvc', 'sliding', 'sandwich');
  balcony.planes = balcony.planes.map((plane, index) => {
    const widthMm = [800, 3200, 900][index]!; const count = [1, 4, 2][index]!;
    return { ...plane, widthMm, heightMm: 2800, sectionCount: count, levels: { mode: 'twoLevel', splitHeightMm: 1000, lowerFill: 'sandwich' },
      sections: Array.from({ length: count }, (_, i) => ({ id: `pane-${i}`, widthMm: widthMm / count,
        ...(index === 0 || index === 2 && i === 0 ? { openingType: 'fixed' as const } : { openingType: 'tilt_turn' as const, hingeSide: i % 2 ? 'right' as const : 'left' as const, hardwareId: 'standard' }) })) };
  });
  return balcony;
}
const visualItems = scenario === 'window-left' ? [visualWindow('left')] : scenario === 'window-right' ? [visualWindow('right')]
  : scenario === 'turn-left' ? [visualWindow('left', 'turn')] : scenario === 'turn-right' ? [visualWindow('right', 'turn')]
  : scenario === 'pvc-u' ? [visualBalcony()]
  : scenario === 'aluminium' ? [proposalBalcony('L', 'aluminium', 'sliding', 'sandwich')]
  : scenario === 'block' ? [proposalBlock()] : scenario === 'finish' ? [proposalFinish('manual')] : undefined;
const calculation = proposalCalculation(visualItems || (scenario === 'small' || scenario === 'absent' ? [proposalWindow()]
  : scenario === 'exact' ? [proposalFinish('manual', Number.MAX_SAFE_INTEGER)]
  : scenario === 'all' ? [proposalWindow(), proposalBlock(), proposalFinish('automatic'), { ...proposalFinish('manual'), id: 'manual-finish' },
    ...(['straight', 'L', 'U'] as const).map((s, i) => ({ ...proposalBalcony(s), id: `pvc-${i}` })),
    { ...proposalBalcony('U', 'aluminium', 'sliding', 'sandwich'), id: 'sliding' }, { ...proposalBalcony('L', 'aluminium', 'swing', 'glass'), id: 'swing' }]
  : [proposalWindow(), proposalBalcony('U', 'aluminium', 'sliding', 'sandwich'), proposalBlock(), proposalFinish(scenario === 'unresolved' ? 'unresolved' : 'manual')]));
if (scenario !== 'exact') {
  if (!visualItems) {
    calculation.measurements[0]!.additionalWorks = [{ id: 'private-work-id', name: 'Демонтаж окна', quantity: 1.25, unit: 'runningMeter', unitPriceMinor: 12345 }];
    calculation.orderAdditionalWorks = [{ id: 'private-order-id', name: 'Доставка', quantity: 2, unit: 'piece', unitPriceMinor: 23456 }];
  }
  calculation.discount = { mode: 'percent', discountPercent: 7.25 };
} else calculation.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: Number.MAX_SAFE_INTEGER - 2, confirmation: 'confirmed', confirmedSubtotalMinor: estimateCalculationVNext(calculation).subtotalMinor! };
const base = buildProposalDocumentV2(calculation, scenario === 'absent' ? undefined : { companyName: 'Окна для вас', sellerName: 'Иван Петров', sellerPhone: '+7 900 1112233', telegram: '@okna' });
const proposal = JSON.parse(JSON.stringify(scenario === 'large' ? { ...base, items: Array.from({ length: 32 }, (_, i) => ({ ...base.items[i % base.items.length]!, id: `detached-${i}` })) }
  : scenario === 'oversized' ? { ...base, items: [{ ...base.items[0]!, name: 'ДлинноеНазваниеБезПробелов'.repeat(12), additionalWorks: Array.from({ length: 120 }, (_, i) => ({ name: `Дополнительная работа ${i}`, quantity: 1, amount: base.items[0]!.total! })) }] } : base));
const liveUrls = new Set<string>();
const createURL = URL.createObjectURL.bind(URL); const revokeURL = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob) => { const url = createURL(blob); liveUrls.add(url); return url; };
URL.revokeObjectURL = (url) => { liveUrls.delete(url); revokeURL(url); };
const liveCanvases = new Set<HTMLCanvasElement>();
const createElement = document.createElement.bind(document);
document.createElement = ((tag: string, options?: ElementCreationOptions) => {
  const element = createElement(tag, options);
  if (element instanceof HTMLCanvasElement) liveCanvases.add(element);
  return element;
}) as typeof document.createElement;
const paint: { text: string; x: number; y: number; width: number; height: number; canvasWidth: number; canvasHeight: number }[] = [];
const rectangles: { x: number; y: number; width: number; height: number; weight: number; canvasWidth: number; canvasHeight: number }[] = [];
const originalRect = CanvasRenderingContext2D.prototype.strokeRect;
CanvasRenderingContext2D.prototype.strokeRect = function(x, y, width, height) {
  rectangles.push({ x, y, width, height, weight: this.lineWidth, canvasWidth: this.canvas.width, canvasHeight: this.canvas.height });
  originalRect.call(this, x, y, width, height);
};
const originalText = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function(text, x, y) {
  const width = this.measureText(text).width; const height = parseInt(this.font.match(/\d+px/)?.[0] || '0');
  const left = this.textAlign === 'center' ? x - width / 2 : this.textAlign === 'right' ? x - width : x;
  const top = this.textBaseline === 'middle' ? y - height / 2 : y;
  const transform = this.getTransform();
  const points = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]].map(([px, py]) => transform.transformPoint(new DOMPoint(px, py)));
  const xs = points.map(p => p.x); const ys = points.map(p => p.y);
  paint.push({ text, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), canvasWidth: this.canvas.width, canvasHeight: this.canvas.height });
  originalText.call(this, text, x, y);
};
let failure = false;
const toBlob = HTMLCanvasElement.prototype.toBlob;
HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
  if (failure) callback(null); else toBlob.call(this, callback, type, quality);
};
Object.assign(window, { feature13: {
  document: proposal, original: JSON.stringify(proposal), calculation: JSON.stringify(calculation),
  fail: (value: boolean) => { failure = value; },
  resources: () => ({ urls: liveUrls.size, canvasPixels: [...liveCanvases].reduce((n, c) => n + c.width * c.height, 0), anchors: document.querySelectorAll('a[download]').length }),
  paint: () => paint,
  rectangles: () => rectangles,
  resetPaint: () => { paint.length = 0; },
  layout: () => { const ctx = createElement('canvas').getContext('2d')!; return layoutProposalImages(proposal, (text, style) => { ctx.font = imageFont(style); return ctx.measureText(text).width; }); },
  generate: async () => {
    const pages = [];
    for await (const image of renderProposalImages(proposal)) {
      const bitmap = await createImageBitmap(image.blob);
      const canvas = createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let schemePixels = 0; let inkPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === 237 && pixels[i + 1] === 245 && pixels[i + 2] === 247) schemePixels++;
        if (pixels[i]! < 160 && pixels[i + 1]! < 160 && pixels[i + 2]! < 160) inkPixels++;
      }
      canvas.width = 0; canvas.height = 0;
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.readAsDataURL(image.blob);
      });
      pages.push({ width: image.width, height: image.height, filename: image.filename, pageCount: image.pageCount, type: image.blob.type, base64, schemePixels, inkPixels });
    }
    return pages;
  },
} });
createRoot(document.getElementById('root')!).render(<ClientView document={proposal} onBack={() => { document.getElementById('root')!.textContent = 'Смета'; }} />);
