import { useEffect, useRef, useState } from 'react';
import type { ProposalDocumentV2 } from '../../domain/documents/proposal-document-v2';
import { proposalPdfV2Filename, type ProposalPdfV2Renderer } from '../../application/documents/proposal-pdf-v2';

/** Local browser handoff only; URL and anchor are released even if the handoff fails. */
export async function downloadProposalPdfV2(blob: Blob): Promise<void> {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  try {
    link.href = url; link.download = proposalPdfV2Filename; link.hidden = true;
    document.body.append(link); link.click();
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
  } finally { link.remove(); URL.revokeObjectURL(url); }
}

type Props = { renderer: ProposalPdfV2Renderer; disabled?: boolean } &
  ({ document: ProposalDocumentV2; getDocument?: never } | { document?: never; getDocument: () => Promise<ProposalDocumentV2> });
export function PdfExportAction({ renderer, document, getDocument, disabled = false }: Props) {
  const running = useRef(false); const mounted = useRef(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function generate() {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); setError(false);
    try {
      // Allow the browser to paint progress before loading jsPDF / generating vectors.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (!mounted.current) return;
      const proposal = document ?? await getDocument!();
      if (!mounted.current) return;
      const blob = await renderer(proposal);
      if (mounted.current) await downloadProposalPdfV2(blob);
    } catch { if (mounted.current) setError(true); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="image-export" aria-label="Экспорт PDF">
    <button disabled={busy || disabled} onClick={() => void generate()}>{busy ? 'Формируем PDF…' : 'Скачать PDF'}</button>
    {busy && <p role="status">Формируем PDF…</p>}
    {error && <p role="alert">Не удалось сформировать PDF. Попробуйте ещё раз.</p>}
  </section>;
}
