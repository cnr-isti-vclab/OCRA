/**
 * rti-seg segments an RTI asset from relit renderings of it, via the sam2
 * service. Reached on the host the page was loaded from unless
 * VITE_RTI_SEG_BASE says otherwise.
 */
function getRtiSegApiBase(): string {
  return import.meta.env.VITE_RTI_SEG_BASE || `${window.location.protocol}//${window.location.hostname}:5004`;
}

/**
 * Outline of the region the points select. `assetUrl` is the asset's own URL,
 * which the service maps back onto its files; points and the returned polygon
 * are in asset pixels.
 */
export async function rtiSegment(
  assetUrl: string,
  points: Array<{ x: number; y: number }>,
  labels: number[],
): Promise<Array<[number, number]>> {
  const response = await fetch(`${getRtiSegApiBase()}/segment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: assetUrl, points: points.map((p) => [p.x, p.y]), labels }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `RTI segment failed: ${response.status}`);
  }
  return body.polygon;
}
