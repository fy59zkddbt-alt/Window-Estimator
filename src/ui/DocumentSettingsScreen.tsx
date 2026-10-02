import { useEffect, useState } from 'react';
import { documentSettingsFields, normalizeDocumentSettings, type DocumentSettings, type DocumentSettingsRepository } from '../application/settings/document-settings';

export function DocumentSettingsScreen({ repository, onClose }: { repository: DocumentSettingsRepository; onClose: () => void }) {
  const [draft, setDraft] = useState<DocumentSettings>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    void repository.load().then((value) => { if (!cancelled) setDraft(value); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные для КП.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [repository]);
  let validation = '';
  if (draft) { try { normalizeDocumentSettings(draft); } catch (reason) { validation = reason instanceof Error ? reason.message : 'Проверьте данные.'; } }
  async function save() {
    if (!draft) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const value = normalizeDocumentSettings(draft);
      await repository.save(value); setDraft(value); setMessage('Данные для КП сохранены.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить данные для КП.'); }
    finally { setBusy(false); }
  }
  return <main><h1>Данные для КП</h1>
    <p>Имя и телефон обязательны. Данные компании можно не заполнять.</p>
    <p className="muted">Данные сохраняются локально в этом браузере после нажатия «Сохранить данные для КП».</p>
    {busy && <p role="status">Сохранение / загрузка…</p>}
    {draft && <form noValidate onSubmit={(event) => { event.preventDefault(); if (!validation && !busy) void save(); }}>
      <fieldset disabled={busy}><legend>Контакты продавца и компания</legend><div className="fields">
        {documentSettingsFields.map(([key, label]) => <label key={key}>{label}<input
          required={key === 'sellerName' || key === 'sellerPhone'}
          type={key === 'email' ? 'email' : key === 'website' ? 'url' : key === 'sellerPhone' || key === 'companyPhone' ? 'tel' : 'text'}
          value={draft[key] ?? ''} onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }); setMessage(''); setError(''); }}
        /></label>)}
      </div></fieldset>
      {validation && <p role="alert" className="validation">{validation}</p>}
      <button disabled={busy || !!validation}>Сохранить данные для КП</button>
    </form>}
    {error && <p role="alert" className="validation">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" disabled={busy} onClick={onClose}>К расчётам без сохранения</button>
  </main>;
}
