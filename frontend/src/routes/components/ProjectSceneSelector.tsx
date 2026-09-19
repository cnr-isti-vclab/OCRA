import { useState } from 'react';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import { MessageModalDescriptor } from '../../shared/ui/AppMessageModalModel';

export interface ProjectSceneOption {
  id: string;
  label: string;
  isDefault?: boolean;
}

interface ProjectSceneSelectorProps {
  scenes: readonly ProjectSceneOption[];
  selectedSceneId: string;
  onSceneChange: (sceneId: string) => void;
}

/** Project-level scene selector that protects in-progress annotation drafts. */
export default function ProjectSceneSelector({
  scenes,
  selectedSceneId,
  onSceneChange,
}: ProjectSceneSelectorProps) {
  const { creationDraft, deletionDraft, creating, deleting } = useAnnotationStore();
  const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId);

  const requestSceneChange = (sceneId: string) => {
    if (sceneId === selectedSceneId || !scenes.some((scene) => scene.id === sceneId)) {
      return;
    }
    if (creationDraft || deletionDraft) {
      setPendingSceneId(sceneId);
      return;
    }
    onSceneChange(sceneId);
  };

  return (
    <>
      <div className="d-flex align-items-center gap-2">
        {scenes.length > 1 ? (
          <label htmlFor="project-scene-selector" className="small fw-semibold text-muted mb-0">Scene</label>
        ) : (
          <span className="small fw-semibold text-muted">Scene</span>
        )}
        {scenes.length > 1 ? (
          <select
            id="project-scene-selector"
            className="form-select form-select-sm"
            style={{ width: 'min(18rem, 50vw)' }}
            value={selectedSceneId}
            disabled={creating || deleting}
            onChange={(event) => requestSceneChange(event.target.value)}
          >
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.label}{scene.isDefault ? ' ★' : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="small text-body">
            {selectedScene?.label ?? selectedSceneId}
          </span>
        )}
      </div>
      <AppMessageModal
        zIndex={1200}
        descriptor={pendingSceneId ? new MessageModalDescriptor({
          tone: 'warning',
          title: 'Change scene?',
          message: 'The annotation draft in the current scene will be discarded.',
          actions: [
            { key: 'keep', label: 'Keep editing', tone: 'secondary' },
            { key: 'change', label: 'Discard draft and change scene', tone: 'danger' },
          ],
          dismissOnBackdrop: false,
        }) : null}
        onClose={() => setPendingSceneId(null)}
        onAction={(actionKey) => {
          if (actionKey === 'change' && pendingSceneId) {
            onSceneChange(pendingSceneId);
          }
          setPendingSceneId(null);
        }}
      />
    </>
  );
}
