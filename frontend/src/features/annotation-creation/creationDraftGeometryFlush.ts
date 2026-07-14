/**
 * Lets viewers push the latest in-canvas geometry into the creation draft
 * immediately before the wizard advances from the geometry step.
 */
type CreationDraftGeometryFlush = () => void;

const activeFlushes = new Set<CreationDraftGeometryFlush>();

export function registerCreationDraftGeometryFlush(
  flush: CreationDraftGeometryFlush,
): () => void {
  activeFlushes.add(flush);
  return () => {
    activeFlushes.delete(flush);
  };
}

export function flushCreationDraftGeometry(): void {
  for (const flush of activeFlushes) {
    flush();
  }
}
