/** Plain domain DTOs only. No browser globals, serialization or mutable shared catalogs. */
export function copyDomainValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => copyDomainValue(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyDomainValue(item)])) as T;
  }
  return value;
}
