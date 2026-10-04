// Runtime origin keeps branch previews and future custom domains independent.
// An optional public override is useful only when a canonical auth origin is intended.
export function authCallbackUrl(configuredOrigin: string | undefined, runtimeOrigin: string): string {
  const url = new URL(configuredOrigin?.trim() || runtimeOrigin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('App origin должен быть HTTPS origin без пути, query или credentials (HTTP разрешён только локально).');
  }
  return new URL('/auth/callback', url.origin).href;
}
