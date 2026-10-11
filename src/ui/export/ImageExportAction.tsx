import { useEffect, useRef, useState } from 'react';
import type { ProposalDocumentV2 } from '../../domain/documents/proposal-document-v2';
import { downloadProposalImage, renderProposalImages } from './render-proposal-images';

export function ImageExportAction({ document }: { document: ProposalDocumentV2 }) {
  const running = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [pages, setPages] = useState(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function exportImages(onlyPage?: number) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(false); setPages(0);
    let count = 0;
    try {
      // Paint feedback before CPU work; no device-DPR or live viewport dependency.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!mounted.current) return;
      for await (const image of renderProposalImages(document, onlyPage)) {
        if (!mounted.current) break;
        count = image.pageCount;
        await downloadProposalImage(image);
      }
      if (mounted.current) setPages(count);
    } catch { if (mounted.current) setError(true); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="image-export" aria-label="Экспорт изображения">
    <button disabled={busy} onClick={() => void exportImages()}>{busy ? 'Формируем изображение…' : 'Скачать изображение'}</button>
    {busy && <p role="status">Формируем изображение…</p>}
    {error && <p role="alert">Не удалось сформировать изображение. Попробуйте ещё раз.</p>}
    {pages > 1 && <div><p role="status">Изображений: {pages}. Если браузер скачал не все, скачайте страницы отдельно.</p>
      {Array.from({ length: pages }, (_, index) => <button className="secondary" disabled={busy} key={index} onClick={() => void exportImages(index)}>Скачать страницу {index + 1}</button>)}
    </div>}
  </section>;
}
