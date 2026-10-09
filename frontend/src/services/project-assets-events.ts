export const PROJECT_ASSETS_CHANGED_EVENT = 'ocra:project-assets-changed';

export function notifyProjectAssetsChanged(projectId: string): void {
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, {
    detail: { projectId },
  }));
}
