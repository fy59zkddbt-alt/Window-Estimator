import { expect, it, vi } from 'vitest';
import { AuthController, type AuthProvider, type AuthUser } from '../src/application/auth/auth';

function setup(session: AuthUser | null = null) {
  let listener: (user: AuthUser | null) => void = () => {};
  const provider: AuthProvider = {
    restore: vi.fn(async () => session),
    login: vi.fn(async () => ({ id: 'A', email: 'a@example.com' })),
    register: vi.fn(async () => ({ needsEmailConfirmation: true })),
    logout: vi.fn(async () => {}),
    subscribe: (callback) => { listener = callback; return () => { listener = () => {}; }; },
  };
  const prepare = vi.fn(async () => {});
  const controller = new AuthController(provider, prepare);
  return { controller, provider, prepare, emit: (user: AuthUser | null) => listener(user) };
}

it('checks session before exposing unauthenticated state', async () => {
  const { controller, prepare } = setup();
  expect(controller.state.status).toBe('loading');
  await controller.start();
  expect(controller.state.status).toBe('anonymous');
  expect(prepare).not.toHaveBeenCalled();
});
it('successful login prepares ownership before app access', async () => {
  const { controller, prepare } = setup();
  await controller.start();
  await controller.login('a@example.com', 'password');
  expect(prepare).toHaveBeenCalledWith('A');
  expect(controller.state).toMatchObject({ status: 'authenticated', user: { id: 'A' } });
});
it('failed login gives a readable error without app access', async () => {
  const { controller, provider } = setup();
  vi.mocked(provider.login).mockRejectedValue(new Error('Неверный email или пароль.'));
  await controller.start();
  await controller.login('a@example.com', 'bad');
  expect(controller.state).toMatchObject({ status: 'anonymous', error: 'Неверный email или пароль.' });
});
it('registration supports required email confirmation and registration failure', async () => {
  const { controller, provider } = setup();
  await controller.start();
  await controller.register('a@example.com', 'password');
  expect(provider.register).toHaveBeenCalledWith('a@example.com', 'password');
  expect(controller.state).toMatchObject({ status: 'anonymous', notice: expect.stringContaining('почт') });
  vi.mocked(provider.register).mockRejectedValue(new Error('Не удалось зарегистрироваться.'));
  await controller.register('a@example.com', 'password');
  expect(controller.state.error).toContain('зарегистрироваться');
});
it('registration without confirmation returns to login', async () => {
  const { controller, provider } = setup();
  vi.mocked(provider.register).mockResolvedValue({ needsEmailConfirmation: false });
  await controller.start();
  await controller.register('a@example.com', 'password');
  expect(controller.state).toMatchObject({ status: 'anonymous', notice: expect.stringContaining('Войдите') });
});
it('restores session and logs out, unmounting app state', async () => {
  const { controller, provider, prepare } = setup({ id: 'A' });
  await controller.start();
  expect(prepare).toHaveBeenCalledWith('A');
  expect(controller.state.status).toBe('authenticated');
  await controller.logout();
  expect(provider.logout).toHaveBeenCalled();
  expect(controller.state.status).toBe('anonymous');
});
it('a signout during ownership preparation cannot resurrect the old user', async () => {
  const { controller, prepare, emit } = setup({ id: 'A' });
  let release!: () => void;
  prepare.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
  const starting = controller.start();
  await vi.waitFor(() => expect(prepare).toHaveBeenCalled());
  emit(null);
  release();
  await starting;
  expect(controller.state.status).toBe('anonymous');
});
it('ownership failure blocks app and allows a retry', async () => {
  const { controller, prepare } = setup({ id: 'A' });
  prepare.mockRejectedValueOnce(new Error('Данные не перенесены.'));
  await controller.start();
  expect(controller.state.status).toBe('error');
  await controller.start();
  expect(controller.state.status).toBe('authenticated');
});
it('ignores a late password response after provider signout', async () => {
  const { controller, provider, emit, prepare } = setup();
  await controller.start();
  let release!: (user: AuthUser) => void;
  vi.mocked(provider.login).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const login = controller.login('a@example.com', 'password');
  emit(null);
  release({ id: 'A' });
  await login;
  expect(controller.state.status).toBe('anonymous');
  expect(prepare).not.toHaveBeenCalled();
});
it('same-user token events preserve app state, another user must prepare its own data', async () => {
  const { controller, prepare, emit } = setup({ id: 'A' });
  await controller.start();
  const state = controller.state;
  emit({ id: 'A' });
  expect(controller.state).toBe(state);
  expect(prepare).toHaveBeenCalledTimes(1);
  emit({ id: 'B' });
  await vi.waitFor(() => expect(controller.state.user?.id).toBe('B'));
  expect(prepare).toHaveBeenLastCalledWith('B');
});
