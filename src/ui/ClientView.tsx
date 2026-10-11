import { useEffect, useRef } from 'react';
import type { ProposalDocumentV2, ProposalWorkV2 } from '../domain/documents/proposal-document-v2';
import { GlazingScheme } from './GlazingScheme';
import { itemPresentation, proposalLabels as labels, workQuantity, summaryLines, sellerLines } from './proposal-presentation';
import { ImageExportAction } from './export/ImageExportAction';
import { customerMoney } from '../presentation/customer-money';
import type { ProposalPdfV2Renderer } from '../application/documents/proposal-pdf-v2';
import { PdfExportAction } from './export/PdfExportAction';

function ClientWorks({ works }: { works: readonly ProposalWorkV2[] }) {
  return <dl className="client-prices">{works.map((work, index) => <div key={index}>
    <dt>{work.name}<small>{workQuantity(work)}</small></dt>
    <dd>{customerMoney(work.amount)}</dd>
  </div>)}</dl>;
}
/** Read-only renderer. Its only content input is the detached ProposalDocument v2. */
export function ClientView({ document, onBack, renderPdf }: { document: ProposalDocumentV2; onBack: () => void; renderPdf?: ProposalPdfV2Renderer }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus(); }, []);
  const { context, seller, summary } = document;
  return <main className="client-view" aria-label="Предложение для клиента">
    <nav aria-label="Навигация предложения"><button className="secondary" onClick={onBack}>Вернуться к смете</button></nav>
    <ImageExportAction document={document} />
    {renderPdf && <PdfExportAction document={document} renderer={renderPdf} />}
    <header className="client-header">
      <h1 ref={heading} tabIndex={-1}>{context.name || labels.title}</h1>
      {context.clientName && <p className="client-name">{context.clientName}</p>}
      {context.objectAddress && <p>{context.objectAddress}</p>}{context.clientPhone && <p>{context.clientPhone}</p>}
      {sellerLines(seller).length > 0 && <div className="client-seller" aria-label="Контакты продавца">{sellerLines(seller).map((line, index) => <p key={index}>{line}</p>)}</div>}
      {document.items.some(item => item.schemes.length) && <p className="muted">{labels.units}</p>}
    </header>
    {summary.message && <p className="client-clarification" role="status">{summary.message}</p>}
    <section aria-label="Состав предложения">{document.items.map((item) => { const presentation = itemPresentation(item); return <article className="client-item" key={item.id} aria-label={item.name}>
      <header><h2>{item.name}</h2>{presentation.subtitle && <p className="client-room">{presentation.subtitle}</p>}{presentation.room && <p className="client-room">{presentation.room}</p>}</header>
      {presentation.schemes.length > 0 && <p className="client-viewpoint">{labels.viewpoint}</p>}
      {presentation.schemes.map((scheme, i) => <figure className="client-scheme" key={i}>
        {scheme.heading !== labels.viewpoint && <figcaption>{scheme.heading}{scheme.note && ` · ${scheme.note}`}</figcaption>}
        <GlazingScheme customer geometry={scheme.geometry} label={`Схема: ${item.name} · ${scheme.heading}`} />
      </figure>)}
      <div className="client-configuration">{presentation.lines.map((line, i) => <p key={i}>{line}</p>)}</div>
      {item.clarification && <p className="client-clarification">{item.clarification}</p>}
      <dl className="client-prices">{item.priceLines.map((line, i) => <div key={i}><dt>{line.label}</dt><dd>{customerMoney(line.amount)}</dd></div>)}</dl>
      {!!item.additionalWorks.length && <section aria-label="Работы этого замера"><h3>{labels.works}</h3><ClientWorks works={item.additionalWorks} /></section>}
      {presentation.showTotal && <p className="client-item-total">{labels.total} <strong>{customerMoney(item.total!)}</strong></p>}
    </article>; })}</section>
    {!!document.orderAdditionalWorks.length && <section className="client-item" aria-label="Работы по заказу"><h2>{labels.orderWorks}</h2><ClientWorks works={document.orderAdditionalWorks} /></section>}
    <section className="client-summary" aria-label={labels.summary}><h2>{labels.summary}</h2>
      <dl className="client-prices">
        {summaryLines(summary).map((line, index) => <div key={index}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}
      </dl>
      {summary.total ? <p className="client-final" data-testid="client-final">{labels.total} <strong>{customerMoney(summary.total)}</strong></p> : <p role="status">{summary.message}</p>}
    </section>
    <button className="secondary" onClick={onBack}>Вернуться к смете</button>
  </main>;
}
