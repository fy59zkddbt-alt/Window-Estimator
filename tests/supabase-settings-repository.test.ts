import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseSettingsRepository } from '../src/infrastructure/auth/supabase-settings-repository';

function setup(user = 'A') {
  const row = { user_id: 'A', revision: 2, payload: { rate: 10 } };
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: row as typeof row | null, error: null as { code: string } | null })),
    single: vi.fn(async () => ({ data: row, error: null as { code: string } | null })),
  };
  const from = vi.fn(() => query);
  const client = { from, auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: user } } }, error: null })) } } as unknown as SupabaseClient;
  return { repository: new SupabaseSettingsRepository(client, 'A', 'calculator_settings', (v) => v), query, from };
}
it('filters reads and atomic updates by owner and expected revision', async () => {
  const s = setup(); await s.repository.load();
  expect(s.query.eq).toHaveBeenCalledWith('user_id', 'A');
  await s.repository.update({ rate: 20 }, 1);
  expect(s.query.eq).toHaveBeenCalledWith('revision', 1);
  expect(s.query.update).toHaveBeenCalledWith({ payload: { rate: 20 } });
});
it('rejects user B using repository A before any query', async () => {
  const s = setup('B');
  for (const operation of [() => s.repository.load(), () => s.repository.create({}), () => s.repository.update({}, 1)]) {
    await expect(operation()).rejects.toMatchObject({ code: 'settings_owner_mismatch' });
  }
  expect(s.from).not.toHaveBeenCalled();
});
it('rejects unexpected owner returned by cloud', async () => {
  const s = setup(); s.query.maybeSingle.mockResolvedValueOnce({ data: { user_id: 'B', revision: 1, payload: { rate: 20 } }, error: null });
  await expect(s.repository.load()).rejects.toMatchObject({ code: 'settings_owner_mismatch' });
});
it('zero updated rows are a conflict and cloud errors are distinct', async () => {
  const s = setup(); s.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  await expect(s.repository.update({}, 1)).rejects.toMatchObject({ code: 'settings_changed_elsewhere' });
  s.query.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'network' } });
  await expect(s.repository.update({}, 1)).rejects.toMatchObject({ code: 'cloud_unavailable' });
});
it('initialization race never performs an upsert', async () => {
  const s = setup(); s.query.single.mockResolvedValueOnce({ data: { user_id: 'A', revision: 1, payload: { rate: 20 } }, error: { code: '23505' } });
  await expect(s.repository.create({})).rejects.toMatchObject({ code: 'settings_changed_elsewhere' });
});
