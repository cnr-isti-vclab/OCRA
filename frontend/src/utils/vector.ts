export function formatVector3(value?: [number, number, number], fallback = '0, 0, 0'): string {
  return value ? value.join(', ') : fallback;
}

export function formatScale(value?: number | [number, number, number], fallback = '1'): string {
  if (value === undefined) return fallback;
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function parseOptionalVector3(value: string, label: string): [number, number, number] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parts = trimmed.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length !== 3) throw new Error(`${label} must have exactly 3 values.`);
  if (parts.some((p) => Number.isNaN(p))) throw new Error(`${label} contains an invalid number.`);

  return [parts[0], parts[1], parts[2]];
}

export function parseOptionalScale(value: string): number | [number, number, number] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes(',')) {
    return parseOptionalVector3(trimmed, 'Scale');
  }

  const parsed = parseFloat(trimmed);
  if (Number.isNaN(parsed)) throw new Error('Scale contains an invalid number.');
  return parsed;
}
