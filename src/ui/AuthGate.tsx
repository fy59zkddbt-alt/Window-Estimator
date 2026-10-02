import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AuthController, AuthUser } from '../application/auth/auth';
import './styles.css';

export function AuthGate({ controller, children }: { controller: AuthController; children: (user: AuthUser) => ReactNode }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [registration, setRegistration] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => { void controller.start(); return () => controller.stop(); }, [controller]);
  useEffect(() => { if (state.notice) setRegistration(false); }, [state.notice]);
  if (state.status === 'authenticated' && state.user) return <div key={state.user.id}>
    <nav className="workflow-nav" aria-label="Аккаунт"><span>{state.user.email ?? 'Аккаунт'}</span><button onClick={() => void controller.logout()}>Выйти</button></nav>
    {children(state.user)}
  </div>;
  if (state.status === 'loading') return <main><h1>Window Estimator</h1><p role="status">Проверка сессии / вход…</p></main>;
  if (state.status === 'error') return <main><h1>Window Estimator</h1><p role="alert" className="validation">{state.error}</p>
    <button onClick={() => void controller.start()}>Повторить</button> <button onClick={() => void controller.logout()}>Выйти</button></main>;
  return <main className="auth-screen"><h1>Window Estimator</h1><h2>{registration ? 'Регистрация' : 'Вход'}</h2>
    {state.error && <p role="alert" className="validation">{state.error}</p>}
    {state.notice && <p role="status">{state.notice}</p>}
    <form onSubmit={(event) => {
      event.preventDefault();
      const submittedPassword = password; setPassword('');
      void (registration ? controller.register(email, submittedPassword) : controller.login(email, submittedPassword));
    }}>
      <div className="fields">
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Пароль<input type="password" autoComplete={registration ? 'new-password' : 'current-password'} required minLength={registration ? 6 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      </div>
      <button type="submit">{registration ? 'Зарегистрироваться' : 'Войти'}</button>
      <button type="button" className="secondary" onClick={() => { setRegistration(!registration); setPassword(''); }}>{registration ? 'Уже есть аккаунт — войти' : 'Создать аккаунт'}</button>
    </form>
    <p className="muted">Расчёты и настройки хранятся локально для вашего аккаунта. При первом входе существующие локальные данные будут привязаны к этому аккаунту с сохранением исходных записей. В другом браузере или отдельном PWA потребуется войти отдельно.</p>
  </main>;
}
