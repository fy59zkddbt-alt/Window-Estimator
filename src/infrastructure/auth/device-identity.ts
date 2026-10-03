/** Installation/browser storage context, not a physical device or fingerprint. */
export class BrowserDeviceIdentity {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly generate: () => string = () => crypto.randomUUID()) {}
  getId(): string {
    const key = 'window-estimator:device:v1';
    const existing = this.storage.getItem(key);
    if (existing) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing)) throw new Error('Invalid stored device identity');
      return existing;
    }
    const id = this.generate();
    this.storage.setItem(key, id);
    return id;
  }
}
