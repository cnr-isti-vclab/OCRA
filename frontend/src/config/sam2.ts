export function getSam2ApiBase(): string {
  if (import.meta.env.VITE_SAM2_BASE) {
    return import.meta.env.VITE_SAM2_BASE;
  }
  // localhost was broken
  return `${window.location.protocol}//${window.location.hostname}:5001`;
}
