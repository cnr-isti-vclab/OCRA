import { useCallback, useMemo, useState } from 'react';
import { useAnnotationStore, type AnnotationStoreLogEntry } from '../../context/AnnotationStoreContext';
import { EMPTY_SELECTION_CRITERIA } from '../../stores/annotation-selection';
import {
  ANNOTATION_TEST_SCRIPTS,
  type AnnotationTestLogTone,
} from './annotation-test/scripts';

function isDefaultSelectionCriteria(criteria: object): boolean {
  return Object.keys(criteria).length === 0;
}

function toneBadgeClass(tone: AnnotationStoreLogEntry['tone']) {
  switch (tone) {
    case 'success':
      return 'bg-success';
    case 'warning':
      return 'bg-warning text-dark';
    case 'error':
      return 'bg-danger';
    default:
      return 'bg-secondary';
  }
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString();
}

export default function AnnotationStoreTestPanel() {
  const {
    store,
    allGeometries,
    allData,
    allLinks,
    activeGeometries,
    activeData,
    activeLinks,
    currentSelectionCriteria,
    selectActiveAnnotations,
    realtimeState,
    loadingAdditionalData,
    creating,
    eventLog,
    clearEventLog,
    loadScene,
  } = useAnnotationStore();

  const [selectedScriptId, setSelectedScriptId] = useState(ANNOTATION_TEST_SCRIPTS[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const [scriptLog, setScriptLog] = useState<AnnotationStoreLogEntry[]>([]);

  const selectedScript = useMemo(
    () => ANNOTATION_TEST_SCRIPTS.find((script) => script.id === selectedScriptId),
    [selectedScriptId],
  );

  const appendScriptLog = useCallback((message: string, tone: AnnotationTestLogTone = 'info') => {
    setScriptLog((current) => {
      const next = [
        ...current,
        {
          id: `${Date.now()}-${Math.random()}`,
          tone,
          timestamp: new Date().toISOString(),
          message,
        },
      ];
      return next.slice(-100);
    });
  }, []);

  const runScript = async () => {
    if (!store || !selectedScript) {
      return;
    }

    setRunning(true);
    appendScriptLog(`Running: ${selectedScript.label}`);
    try {
      await selectedScript.run({
        store,
        log: appendScriptLog,
        sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendScriptLog(`Script failed: ${message}`, 'error');
    } finally {
      setRunning(false);
    }
  };

  const reloadScene = async () => {
    if (!store) {
      return;
    }
    appendScriptLog('Reloading current scene…');
    await loadScene(store.sceneScopeId);
    appendScriptLog('Scene reload finished', 'success');
  };

  const resetActiveFilter = () => {
    selectActiveAnnotations(EMPTY_SELECTION_CRITERIA);
    appendScriptLog('Active filter reset to {} (all loaded entities)', 'success');
  };

  const criteriaSummary = useMemo(() => {
    if (isDefaultSelectionCriteria(currentSelectionCriteria)) {
      return 'default {} — all loaded entities active';
    }
    try {
      return JSON.stringify(currentSelectionCriteria);
    } catch {
      return '(non-serializable criteria)';
    }
  }, [currentSelectionCriteria]);

  return (
    <div className="h-100 d-flex flex-column p-3 overflow-hidden">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-3 flex-shrink-0">
        <div>
          <h2 className="h5 mb-1">Annotation Store Lab</h2>
          <p className="text-muted small mb-0">
            Programmatic concurrency checks via <code>AnnotationStore</code>. Open a second browser tab on the same scene to observe SSE.
          </p>
        </div>
        <span className={`badge ${realtimeState === 'connected' ? 'bg-success' : 'bg-secondary'}`}>
          SSE: {realtimeState}
        </span>
      </div>

      <div className="row g-3 flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
        <div className="col-lg-4 d-flex flex-column gap-3 overflow-auto min-h-0">
          <div className="card">
            <div className="card-header py-2">
              <strong>Store snapshot</strong>
            </div>
            <div className="card-body py-2 small">
              <div>Scene: <code>{store?.sceneScopeId ?? '—'}</code></div>
              <div className="mt-2">
                <strong className="d-block">Loaded (all)</strong>
                <div>Geometries: {allGeometries.length}</div>
                <div>Data: {allData.length}</div>
                <div>Links: {allLinks.length}</div>
              </div>
              <div className="mt-2">
                <strong className="d-block">Active (query filter)</strong>
                <div>Geometries: {activeGeometries.length}</div>
                <div>Data: {activeData.length}</div>
                <div>Links: {activeLinks.length}</div>
              </div>
              <div className="mt-2 text-muted">
                Filter: <code className="user-select-all">{criteriaSummary}</code>
              </div>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm mt-2"
                onClick={resetActiveFilter}
                disabled={!store || isDefaultSelectionCriteria(currentSelectionCriteria)}
              >
                Reset filter to {'{}'}
              </button>
              <div className="mt-2">Creating: {creating ? 'yes' : 'no'}</div>
              <div>Loading project data: {loadingAdditionalData ? 'yes' : 'no'}</div>
            </div>
          </div>

          <div className="card flex-grow-1 d-flex flex-column">
            <div className="card-header py-2">
              <strong>Scripts</strong>
            </div>
            <div className="card-body d-flex flex-column gap-2">
              <select
                className="form-select form-select-sm"
                value={selectedScriptId}
                onChange={(e) => setSelectedScriptId(e.target.value)}
                disabled={running}
              >
                {ANNOTATION_TEST_SCRIPTS.map((script) => (
                  <option key={script.id} value={script.id}>{script.label}</option>
                ))}
              </select>
              {selectedScript && (
                <p className="small text-muted mb-0">{selectedScript.description}</p>
              )}
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void runScript()}
                  disabled={running || !store}
                >
                  {running ? 'Running…' : 'Run script'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => void reloadScene()}
                  disabled={running || !store}
                >
                  Reload scene
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="col-lg-8 d-flex flex-column gap-3 overflow-hidden h-100"
          style={{ minHeight: 0 }}
        >
          <div
            className="card flex-grow-1 d-flex flex-column overflow-hidden"
            style={{ minHeight: 0 }}
          >
            <div className="card-header py-2 d-flex justify-content-between align-items-center flex-shrink-0">
              <strong>SSE &amp; store events</strong>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={clearEventLog}
              >
                Clear
              </button>
            </div>
            <div
              className="card-body p-0 flex-grow-1 overflow-auto"
              style={{ minHeight: 0 }}
            >
              {eventLog.length === 0 ? (
                <p className="text-muted small p-3 mb-0">Waiting for SSE connection and mutations…</p>
              ) : (
                <ul className="list-group list-group-flush small">
                  {[...eventLog].reverse().map((entry) => (
                    <li key={entry.id} className="list-group-item d-flex gap-2 align-items-start">
                      <span className={`badge ${toneBadgeClass(entry.tone)}`}>{entry.tone}</span>
                      <span className="text-muted flex-shrink-0">{formatTime(entry.timestamp)}</span>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div
            className="card flex-grow-1 d-flex flex-column overflow-hidden"
            style={{ minHeight: 0 }}
          >
            <div className="card-header py-2 d-flex justify-content-between align-items-center flex-shrink-0">
              <strong>Script output</strong>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setScriptLog([])}
              >
                Clear
              </button>
            </div>
            <div
              className="card-body p-0 flex-grow-1 overflow-auto"
              style={{ minHeight: 0 }}
            >
              {scriptLog.length === 0 ? (
                <p className="text-muted small p-3 mb-0">Run a script to see step-by-step output.</p>
              ) : (
                <ul className="list-group list-group-flush small">
                  {[...scriptLog].reverse().map((entry) => (
                    <li key={entry.id} className="list-group-item d-flex gap-2 align-items-start">
                      <span className={`badge ${toneBadgeClass(entry.tone)}`}>{entry.tone}</span>
                      <span className="text-muted flex-shrink-0">{formatTime(entry.timestamp)}</span>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
