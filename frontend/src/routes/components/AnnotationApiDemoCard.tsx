import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnnotationMutationEvent, AnnotationSocialLockEvent } from 'shared/annotation-events';
import type { AnnotationShape } from 'shared/annotation-types';
import {
  AnnotationApiClient,
  buildReadableMutationMessage,
  buildReadableSocialLockMessage,
  type AnnotationSceneBundle,
} from '../../services/AnnotationApiClient';
import type { AnnotationRealtimeState } from '../../services/AnnotationEventsService';

interface AnnotationApiDemoCardProps {
  projectId: string;
  sceneId: string;
  variant: 'project' | 'annotations';
}

interface TimelineEntry {
  id: string;
  tone: 'info' | 'warning' | 'success';
  timestamp: string;
  message: string;
}

const DEMO_WAIT_MS = 2_500;

function createFakeShape(seed: number): AnnotationShape {
  const offset = seed % 10;
  return {
    type: 'ShapePoints',
    vertices: [[offset, offset + 1, offset + 2]],
  };
}

function formatTimelineTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString();
}

function addTimelineEntry(
  setter: React.Dispatch<React.SetStateAction<TimelineEntry[]>>,
  tone: TimelineEntry['tone'],
  message: string,
  timestamp = new Date().toISOString(),
) {
  setter((current) => {
    const next = [...current, { id: `${Date.now()}-${Math.random()}`, tone, timestamp, message }];
    return next.slice(-8);
  });
}

export default function AnnotationApiDemoCard({ projectId, sceneId, variant }: AnnotationApiDemoCardProps) {
  const client = useMemo(() => new AnnotationApiClient({ projectId, sceneId }), [projectId, sceneId]);
  const mountedRef = useRef(true);
  const [bundle, setBundle] = useState<AnnotationSceneBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningDemo, setRunningDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<AnnotationRealtimeState>('idle');
  const [activeLocks, setActiveLocks] = useState<AnnotationSocialLockEvent[]>([]);
  const [lastMutation, setLastMutation] = useState<AnnotationMutationEvent | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBundle = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextBundle = await client.loadSceneBundle(true);
        if (!cancelled && mountedRef.current) {
          setBundle(nextBundle);
        }
      } catch (loadError) {
        if (!cancelled && mountedRef.current) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load annotations');
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    };

    void loadBundle();

    // Keep this card subscribed to the annotation broadcast-network SSE channel so the team can
    // see social locks and committed mutations as they happen.
    client.connectRealtime({
      onConnected: (event) => {
        if (cancelled || !mountedRef.current) {
          return;
        }

        setActiveLocks(
          event.activeSocialLocks.map((lock) => ({
            ...lock,
            type: 'annotation.social_lock.started' as const,
            timestamp: event.timestamp,
          })),
        );
      },
      onConnectionStateChange: (state) => {
        if (!cancelled && mountedRef.current) {
          setRealtimeState(state);
        }
      },
      onMutation: (event) => {
        if (cancelled || !mountedRef.current) {
          return;
        }

        setLastMutation(event);
        addTimelineEntry(setTimeline, 'success', buildReadableMutationMessage(event, sceneId), event.timestamp);
      },
      onSocialLockStarted: (event) => {
        if (cancelled || !mountedRef.current) {
          return;
        }

        setActiveLocks((current) => {
          const filtered = current.filter(
            (entry) => !(entry.streamId === event.streamId && entry.resourceType === event.resourceType && entry.resourceId === event.resourceId),
          );
          return [event, ...filtered];
        });
        addTimelineEntry(setTimeline, 'warning', buildReadableSocialLockMessage(event, sceneId), event.timestamp);
      },
      onSocialLockStopped: (event) => {
        if (cancelled || !mountedRef.current) {
          return;
        }

        setActiveLocks((current) => current.filter(
          (entry) => !(entry.streamId === event.streamId && entry.resourceType === event.resourceType && entry.resourceId === event.resourceId),
        ));
        addTimelineEntry(setTimeline, 'info', buildReadableSocialLockMessage(event, sceneId), event.timestamp);
      },
      onReconnect: () => {
        void loadBundle();
      },
    });

    return () => {
      cancelled = true;
      client.disconnectRealtime();
    };
  }, [client, sceneId]);

  const refreshBundle = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextBundle = await client.loadSceneBundle(true);
      if (mountedRef.current) {
        setBundle(nextBundle);
      }
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load annotations');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const runDemo = async () => {
    setRunningDemo(true);
    setError(null);
    addTimelineEntry(setTimeline, 'info', 'Demo started: loading scene annotations and requesting a social lock.');

    let createdGeometryId: string | null = null;
    let createdDataId: string | null = null;
    let createdLinkId: string | null = null;

    try {
      const before = await client.loadSceneBundle(true);
      if (mountedRef.current) {
        setBundle(before);
      }
      addTimelineEntry(
        setTimeline,
        'info',
        `Scene snapshot: ${before.geometries.length} geometries, ${before.data.length} data records, ${before.links.length} links.`,
      );

      // The social lock is informational only: it tells other connected users
      // what this session is editing, but it does not enforce write exclusion.
      await client.notifySocialLockStart({ activity: 'running annotation API demo' });

      await new Promise((resolve) => window.setTimeout(resolve, DEMO_WAIT_MS));

      const timestamp = new Date().toISOString();
      // Create a full geometry/data/link trio so the demo exercises the main
      // REST endpoints of the new annotation model in one click.
      const geometry = await client.createGeometry({
        shapes: [createFakeShape(Date.now())],
        referenceType: 'scene',
        referenceId: sceneId,
      });
      createdGeometryId = geometry.id;

      const datum = await client.createData({
        label: `Demo annotation ${timestamp}`,
        description: 'Synthetic annotation created from the frontend demo card.',
        class: 'demo.annotation',
        content: {
          source: 'frontend-demo',
          sceneId,
          createdAt: timestamp,
        },
        visibilityType: 'scene',
        visibilityId: sceneId,
      });
      createdDataId = datum.id;

      const link = await client.createLink({
        geometryId: geometry.id,
        dataId: datum.id,
      });
      createdLinkId = link.id;

      await client.updateData(datum.id, {
        expectedVersion: datum.version,
        description: `Synthetic annotation updated from the frontend demo card at ${timestamp}.`,
        content: {
          source: 'frontend-demo',
          sceneId,
          createdAt: timestamp,
          updatedByDemo: true,
        },
      });

      const after = await client.loadSceneBundle(true);
      if (mountedRef.current) {
        setBundle(after);
      }

      addTimelineEntry(
        setTimeline,
        'success',
        `Demo completed: created geometry ${createdGeometryId}, data ${createdDataId}, link ${createdLinkId}, then updated the data record.`,
      );
    } catch (demoError) {
      const message = demoError instanceof Error ? demoError.message : 'Demo failed';
      if (mountedRef.current) {
        setError(message);
      }
      addTimelineEntry(setTimeline, 'warning', `Demo failed: ${message}`);
    } finally {
      try {
        // Always attempt to clear the informational social lock even when one
        // of the demo requests fails midway through the flow.
        await client.notifySocialLockStop({ activity: 'running annotation API demo' });
      } catch {
        // Keep the demo removable and non-blocking.
      }

      void refreshBundle();
      if (mountedRef.current) {
        setRunningDemo(false);
      }
    }
  };

  const cardClass = variant === 'project' ? 'card border-info-subtle shadow-sm' : 'card border-secondary-subtle';
  const title = variant === 'project' ? 'Annotation API activity' : 'Annotation API demo';
  const description = variant === 'project'
    ? 'Readable social-lock and mutation activity for the current project/scene.'
    : 'Temporary demo module: exercises the new annotation REST API without touching the legacy viewer annotations.';

  return (
    <div className={cardClass}>
      <div className="card-body d-flex flex-column gap-3">
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <h5 className="card-title mb-1">{title}</h5>
            <p className="card-text text-muted small mb-0">{description}</p>
          </div>
          <span className={`badge ${realtimeState === 'connected' ? 'bg-success' : realtimeState === 'error' ? 'bg-danger' : 'bg-secondary'}`}>
            {realtimeState}
          </span>
        </div>

        {variant === 'annotations' && (
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void runDemo()}
              disabled={runningDemo || realtimeState === 'idle' || realtimeState === 'connecting'}
            >
              {runningDemo ? 'Running demo...' : 'Run annotation API demo'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => void refreshBundle()}
              disabled={loading}
            >
              Refresh snapshot
            </button>
          </div>
        )}

        {error && (
          <div className="alert alert-danger py-2 mb-0">
            {error}
          </div>
        )}

        <div className="row g-2">
          <div className="col-4">
            <div className="border rounded p-2 h-100 bg-light-subtle">
              <div className="small text-muted">Geometries</div>
              <div className="fw-semibold">{loading ? '...' : bundle?.geometries.length ?? 0}</div>
              <div className="small text-muted">erasable {bundle?.geometries.filter((item) => item.erasableAt !== null).length ?? 0}</div>
            </div>
          </div>
          <div className="col-4">
            <div className="border rounded p-2 h-100 bg-light-subtle">
              <div className="small text-muted">Data</div>
              <div className="fw-semibold">{loading ? '...' : bundle?.data.length ?? 0}</div>
              <div className="small text-muted">erasable {bundle?.data.filter((item) => item.erasableAt !== null).length ?? 0}</div>
            </div>
          </div>
          <div className="col-4">
            <div className="border rounded p-2 h-100 bg-light-subtle">
              <div className="small text-muted">Links</div>
              <div className="fw-semibold">{loading ? '...' : bundle?.links.length ?? 0}</div>
              <div className="small text-muted">erasable {bundle?.links.filter((item) => item.erasableAt !== null).length ?? 0}</div>
            </div>
          </div>
        </div>

        {variant === 'annotations' && bundle && (
          <div className="small">
            <div className="fw-semibold mb-1">Current data records</div>
            <div className="border rounded p-2 bg-body-tertiary" style={{ maxHeight: '160px', overflow: 'auto' }}>
              {bundle.data.length === 0 ? (
                <div className="text-muted">No annotation data records in this scene.</div>
              ) : (
                bundle.data.slice(0, 8).map((datum) => (
                  <div key={datum.id} className="d-flex justify-content-between gap-2 py-1 border-bottom last-child-border-0">
                    <span className="text-truncate">{datum.label}</span>
                    <span className={`badge ${datum.erasableAt ? 'bg-warning text-dark' : 'bg-success'}`}>
                      {datum.erasableAt ? 'erasable' : 'non-erasable'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="small">
          <div className="fw-semibold mb-1">Active social locks</div>
          <div className="border rounded p-2 bg-body-tertiary" style={{ maxHeight: '120px', overflow: 'auto' }}>
            {activeLocks.length === 0 ? (
              <div className="text-muted">No active annotation social locks for this scene.</div>
            ) : (
              activeLocks.map((event) => (
                <div key={`${event.streamId}:${event.resourceType ?? 'scene'}:${event.resourceId ?? 'all'}`} className="py-1 border-bottom last-child-border-0">
                  {buildReadableSocialLockMessage(event, sceneId)}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="small">
          <div className="fw-semibold mb-1">Recent annotation signals</div>
          <div className="border rounded p-2 bg-body-tertiary" style={{ maxHeight: variant === 'project' ? '120px' : '180px', overflow: 'auto' }}>
            {timeline.length === 0 ? (
              <div className="text-muted">Waiting for annotation social-lock or mutation events.</div>
            ) : (
              timeline.map((entry) => (
                <div key={entry.id} className="py-1 border-bottom last-child-border-0">
                  <span className="text-muted me-2">[{formatTimelineTimestamp(entry.timestamp)}]</span>
                  {entry.message}
                </div>
              ))
            )}
          </div>
          {lastMutation && (
            <div className="text-muted mt-2">
              Last mutation: {buildReadableMutationMessage(lastMutation, sceneId)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}