export type CheckoutReturnState = 'success' | 'fail' | null;
/** Query only chooses explanatory copy; it is never proof of payment. */
export function checkoutReturnState(search: string): CheckoutReturnState {
  const value = new URLSearchParams(search).get('checkout');
  return value === 'success' || value === 'fail' ? value : null;
}
export function CheckoutReturn({ state, refresh, dismiss }: {
  state: Exclude<CheckoutReturnState, null>; refresh(): void; dismiss(): void;
}) {
  return <section className="notice" aria-label="Возврат после оплаты">
    <p role="status">{state === 'success'
      ? 'Платёж обрабатывается и проверяется. Возвращение со страницы оплаты не подтверждает оплату. Доступ обновится после серверного подтверждения.'
      : 'Оплата не завершена. Вернитесь к подписке и попробуйте снова.'}</p>
    <button onClick={refresh}>Обновить сведения о доступе</button>
    <button onClick={dismiss}>Вернуться к подписке</button>
  </section>;
}
