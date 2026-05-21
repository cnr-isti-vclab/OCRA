import type { AnnotationShape } from 'shared/annotation-types';
import type { AnnotationStore } from '../../../stores/AnnotationStore';

export type AnnotationTestLogTone = 'info' | 'success' | 'warning' | 'error';

export interface AnnotationTestScriptContext {
  store: AnnotationStore;
  log: (message: string, tone?: AnnotationTestLogTone) => void;
  sleep: (ms: number) => Promise<void>;
}

export interface AnnotationTestScript {
  id: string;
  label: string;
  description: string;
  run: (ctx: AnnotationTestScriptContext) => Promise<void>;
}

function createFakeShape(seed: number): AnnotationShape {
  const offset = seed % 10;
  return {
    type: 'ShapePoints',
    vertices: [[offset, offset + 1, offset + 2]],
  };
}

function buildCreateInput(seed: number, sceneId: string) {
  const timestamp = new Date().toISOString();
  return {
    shapes: [createFakeShape(seed)],
    label: `Lab annotation ${seed}`,
    description: 'Created by Annotation Store test lab',
    class: 'lab.annotation',
    content: {
      source: 'annotation-store-lab',
      sceneId,
      seed,
      createdAt: timestamp,
    },
  };
}

export const ANNOTATION_TEST_SCRIPTS: AnnotationTestScript[] = [
  {
    id: 'create-one',
    label: 'Create one annotation',
    description: 'Sequential POST geometry → data → link through the store.',
    async run({ store, log }) {
      const sceneId = store.sceneScopeId;
      log('Creating a single annotation…');
      await store.createAnnotation(buildCreateInput(Date.now(), sceneId));
      log('Create finished', 'success');
    },
  },
  {
    id: 'create-burst',
    label: 'Create burst (5)',
    description: 'Creates five annotations sequentially to exercise OCC and SSE refresh.',
    async run({ store, log, sleep }) {
      const sceneId = store.sceneScopeId;
      for (let i = 0; i < 5; i += 1) {
        log(`Creating annotation ${i + 1}/5…`);
        await store.createAnnotation(buildCreateInput(Date.now() + i, sceneId));
        await sleep(400);
      }
      log('Burst create finished', 'success');
    },
  },
  {
    id: 'concurrent-create',
    label: 'Concurrent create (3)',
    description: 'Fires parallel createAnnotation calls — only one should run at a time in the store.',
    async run({ store, log }) {
      const sceneId = store.sceneScopeId;
      log('Starting 3 parallel createAnnotation calls…');
      await Promise.all([
        store.createAnnotation(buildCreateInput(Date.now(), sceneId)),
        store.createAnnotation(buildCreateInput(Date.now() + 1, sceneId)),
        store.createAnnotation(buildCreateInput(Date.now() + 2, sceneId)),
      ]);
      log('Parallel batch settled (store serializes isCreating)', 'success');
    },
  },
  {
    id: 'update-first-geometry',
    label: 'Update first geometry',
    description: 'Optimistic geometry update on the first entity in the store.',
    async run({ store, log }) {
      const geometry = [...store.geometriesById.values()][0];
      if (!geometry) {
        log('No geometry in store — run a create script first', 'warning');
        return;
      }
      log(`Updating geometry ${geometry.id} (v${geometry.version})…`);
      await store.updateGeometry(geometry.id, [
        createFakeShape(geometry.version + Date.now()),
      ]);
      log('Geometry update finished', 'success');
    },
  },
  {
    id: 'mark-first-link-erasable',
    label: 'Mark first link erasable',
    description: 'Soft-deletes the first link via the erasable transition.',
    async run({ store, log }) {
      const link = [...store.linksById.values()][0];
      if (!link) {
        log('No link in store', 'warning');
        return;
      }
      log(`Marking link ${link.id} erasable (v${link.version})…`);
      await store.markLinkErasable(link.id);
      log('Link marked erasable', 'success');
    },
  },
  {
    id: 'mark-first-link-non-erasable',
    label: 'Mark first link non-erasable',
    description: 'Marks the first link as non-erasable via the non-erasable transition.',
    async run({ store, log }) {
      const link = [...store.linksById.values()][0];
      if (!link) {
        log('No link in store', 'warning');
        return;
      }
      log(`Marking link ${link.id} non-erasable (v${link.version})…`);
      await store.markLinkNonErasable(link.id);
      log('Link marked non-erasable', 'success');
    },
  },
  {
    id: 'load-project-data',
    label: 'Load project data',
    description: 'On-demand project-wide data fetch merged into the store.',
    async run({ store, log }) {
      log('Loading project-wide data…');
      await store.loadProjectData();
      log(`Project data loaded (${store.dataById.size} data record(s) in store)`, 'success');
    },
  },
  {
    id: 'presence-lock',
    label: 'Announce presence',
    description: 'Sends a scene-wide presence social lock through the store client.',
    async run({ store, log, sleep }) {
      log('Starting presence lock…');
      await store.notifyPresenceStart('annotation store lab');
      await sleep(1500);
      log('Stopping presence lock…');
      await store.notifyPresenceStop('annotation store lab');
      log('Presence lock cycle finished', 'success');
    },
  },
];

export function getAnnotationTestScript(id: string): AnnotationTestScript | undefined {
  return ANNOTATION_TEST_SCRIPTS.find((script) => script.id === id);
}
