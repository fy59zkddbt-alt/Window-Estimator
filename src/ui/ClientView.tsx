import { useEffect, useRef } from 'react';
import type { ProposalDocumentV2, ProposalWorkV2 } from '../domain/documents/proposal-document-v2';
import { GlazingScheme } from './GlazingScheme';

const mm = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 6 });
function ClientWorks({ works }: { works: readonly ProposalWorkV2[] }) {
  return <dl className="client-prices">{works.map((work, index) => <div key={index}>
    <dt>{work.name}<small>{work.quantity.toLocaleString('ru-RU', { maximumSignificantDigits: 17 })}{work.unitLabel ? ` ${work.unitLabel}` : ''}</small></dt>
    <dd>{work.amount.display}</dd>
  </div>)}</dl>;
}
/** Read-only renderer. Its only content input is the detached ProposalDocument v2. */
export function ClientView({ document, onBack }: { document: ProposalDocumentV2; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus(); }, []);
  const { context, seller, summary } = document;
  return <main className="client-view" aria-label="Предложение для клиента">
    <nav aria-label="Навигация предложения"><button className="secondary" onClick={onBack}>Вернуться к смете</button></nav>
    <header className="client-header"><p className="eyebrow">ЗАМЕРОК</p>
      <h1 ref={heading} tabIndex={-1}>{context.name || 'Ваше предложение'}</h1>
      {context.clientName && <p className="client-name">{context.clientName}</p>}
      {context.objectAddress && <p>{context.objectAddress}</p>}{context.clientPhone && <p>{context.clientPhone}</p>}
      <p className="muted">Расчёт от {new Date(context.createdAt).toLocaleDateString('ru-RU')} · № {context.calculationId}</p>
    </header>
    {summary.message && <p className="client-clarification" role="status">{summary.message}</p>}
    <section aria-label="Состав предложения">{document.items.map((item, index) => <article className="client-item" key={item.id} aria-label={item.name}>
      <header><p className="eyebrow">{index + 1} · {item.typeLabel}</p><h2>{item.name}</h2><p className="client-room">{item.room}</p></header>
      <ul className="client-dimensions">{item.dimensions.map((dimension, i) => <li key={i}>{dimension.label}: <strong>{mm(dimension.widthMm)} × {mm(dimension.heightMm)} мм</strong>
        {dimension.depthMm !== undefined && <> · глубина {mm(dimension.depthMm)} мм</>}</li>)}</ul>
      <dl className="client-properties">{item.properties.map((property, i) => <div key={i}><dt>{property.label}</dt><dd>{property.value}</dd></div>)}</dl>
      {item.schemes.map((scheme, i) => <figure className="client-scheme" key={i}>
        <figcaption>{scheme.label}</figcaption><GlazingScheme geometry={scheme.geometry} label={`Схема: ${item.name} · ${scheme.label}`} />
        <ul className="client-sections">{scheme.geometry.sections.map((section, sectionIndex) => <li key={sectionIndex}>
          <strong>{section.label}</strong>: {mm(section.widthMm)} × {mm(section.heightMm)} мм · {section.openingLabel}
          {section.fill === 'sandwich' && ' · сэндвич-панель'}{section.hingeLabel && ` · ${section.hingeLabel}`}{section.hardwareLabel && ` · ${section.hardwareLabel}`}
        </li>)}</ul>
        {scheme.geometry.transom && <p className="muted">Глухая фрамуга: {mm(scheme.geometry.transom.heightMm)} мм</p>}
      </figure>)}
      {item.clarification && <p className="client-clarification">{item.clarification}</p>}
      <dl className="client-prices">{item.priceLines.map((line, i) => <div key={i}><dt>{line.label}</dt><dd>{line.amount.display}</dd></div>)}</dl>
      {!!item.additionalWorks.length && <section aria-label="Работы этого замера"><h3>Дополнительные работы</h3><ClientWorks works={item.additionalWorks} /></section>}
      {item.total && <p className="client-item-total">Всего по позиции <strong>{item.total.display}</strong></p>}
    </article>)}</section>
    {!!document.orderAdditionalWorks.length && <section className="client-item" aria-label="Работы по заказу"><h2>Дополнительные работы по заказу</h2><ClientWorks works={document.orderAdditionalWorks} /></section>}
    <section className="client-summary" aria-label="Стоимость предложения"><h2>Стоимость предложения</h2>
      <dl className="client-prices">
        {summary.subtotal && <div><dt>Сумма заказа</dt><dd>{summary.subtotal.display}</dd></div>}
        {summary.discount && <div><dt>{summary.discount.label}</dt><dd>−{summary.discount.amount.display}</dd></div>}
        {!!summary.roundingAdjustment?.minor && <div><dt>Округление суммы</dt><dd>{summary.roundingAdjustment.display}</dd></div>}
      </dl>
      {summary.total ? <p className="client-final" data-testid="client-final">Итого <strong>{summary.total.display}</strong></p> : <p role="status">{summary.message}</p>}
    </section>
    {seller && <footer className="client-seller" aria-label="Контакты продавца">
      {seller.companyName && <h2>{seller.companyName}</h2>}{seller.sellerName && <p>{seller.sellerName}</p>}
      {seller.sellerPhone && <p>Телефон: {seller.sellerPhone}</p>}{seller.companyPhone && <p>Телефон компании: {seller.companyPhone}</p>}
      {seller.telegram && <p>Telegram: {seller.telegram}</p>}{seller.whatsapp && <p>WhatsApp: {seller.whatsapp}</p>}
      {seller.email && <p>{seller.email}</p>}{seller.website && <p>{seller.website}</p>}{seller.inn && <p>ИНН {seller.inn}</p>}
    </footer>}
    <button className="secondary" onClick={onBack}>Вернуться к смете</button>
  </main>;
}
