import { createHash } from 'node:crypto';

export function stringifyWithSort(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return JSON.stringify(data);
  }

  if (Array.isArray(data)) {
    return '[' + data.map((item) => stringifyWithSort(item)).join(',') + ']';
  }

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const sortedObject: Record<string, unknown> = {};

  for (const key of keys) {
    sortedObject[key] = obj[key];
  }

  return JSON.stringify(sortedObject);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
