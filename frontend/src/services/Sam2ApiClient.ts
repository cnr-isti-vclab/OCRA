import { getSam2ApiBase } from '../config/sam2';

export interface Sam2SegmentResult {
  polygon: Array<[number, number]>; // [[x, y], ...] in image pixel coords
  width: number;
  height: number;
  score: number;
}

export async function sam2Segment(
  imageBlob: Blob,
  points: Array<{ x: number; y: number }>,
  labels: number[],
): Promise<Sam2SegmentResult> {
  const formData = new FormData();
  formData.append('image', imageBlob, 'image.jpg');
  formData.append('points', JSON.stringify(points.map((p) => [p.x, p.y])));
  formData.append('labels', JSON.stringify(labels));

  const response = await fetch(`${getSam2ApiBase()}/segment`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `SAM2 segment failed: ${response.status}`);
  }

  return response.json();
}

export async function sam2HealthCheck(): Promise<boolean> {
  try {
    const resp = await fetch(`${getSam2ApiBase()}/health`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return false;
    const body = await resp.json();
    return Boolean(body.model_loaded);
  } catch {
    return false;
  }
}
