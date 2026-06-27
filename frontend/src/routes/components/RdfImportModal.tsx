import { useEffect, useState } from 'react';
import { createProjectFromEchoesRdf } from '../../services/EchoesApi';
import type { EchoesImportMode } from '../../types';

interface RdfImportModalProps {
  show: boolean;
  onClose: () => void;
  onImported: (projectId: string) => void;
}

function inferProjectName(file: File | null): string {
  if (!file) {
    return '';
  }

  return file.name.replace(/\.(rdf|xml)$/i, '');
}

export default function RdfImportModal({
  show,
  onClose,
  onImported,
}: RdfImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectPublic, setProjectPublic] = useState(false);
  const [importMode, setImportMode] = useState<EchoesImportMode>('full_project_without_annotations');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) {
      return;
    }

    setFile(null);
    setProjectName('');
    setProjectDescription('');
    setProjectPublic(false);
    setImportMode('full_project_without_annotations');
    setImportError(null);
  }, [show]);

  async function handleImport(): Promise<void> {
    if (!file) {
      setImportError('Select an RDF file before importing.');
      return;
    }

    try {
      setImportBusy(true);
      setImportError(null);

      const response = await createProjectFromEchoesRdf({
        file,
        name: projectName.trim() || undefined,
        description: projectDescription.trim() || undefined,
        public: projectPublic,
        importMode,
      });

      onImported(response.project.id);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import the project from RDF.');
    } finally {
      setImportBusy(false);
    }
  }

  if (!show) {
    return null;
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-1">Import from RDF</h5>
              <div className="small text-muted">
                Upload an RDF/XML file exported by OCRA or downloaded from an ECCCH named graph, then create a new OCRA project from it.
              </div>
            </div>
            <button type="button" className="btn-close" onClick={() => !importBusy && onClose()} aria-label="Close"></button>
          </div>

          <div className="modal-body">
            <div className="mb-3">
              <label htmlFor="rdfImportFile" className="form-label">RDF file</label>
              <input
                id="rdfImportFile"
                type="file"
                className="form-control"
                accept=".rdf,.xml,application/rdf+xml,application/xml,text/xml"
                disabled={importBusy}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setImportError(null);
                  if (!projectName.trim()) {
                    setProjectName(inferProjectName(nextFile));
                  }
                }}
              />
              <div className="form-text">
                The RDF can contain just HC1/HC8 metadata, or a full OCRA snapshot payload with scenes and annotations.
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-12">
                <label htmlFor="rdfProjectName" className="form-label">New Project Name</label>
                <input
                  id="rdfProjectName"
                  type="text"
                  className="form-control"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  disabled={importBusy}
                />
              </div>
              <div className="col-12">
                <label htmlFor="rdfProjectDescription" className="form-label">Description</label>
                <textarea
                  id="rdfProjectDescription"
                  className="form-control"
                  rows={4}
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  disabled={importBusy}
                />
              </div>
              <div className="col-12">
                <div className="form-check">
                  <input
                    id="rdfProjectPublic"
                    className="form-check-input"
                    type="checkbox"
                    checked={projectPublic}
                    onChange={(event) => setProjectPublic(event.target.checked)}
                    disabled={importBusy}
                  />
                  <label className="form-check-label" htmlFor="rdfProjectPublic">
                    Public project
                  </label>
                </div>
              </div>
            </div>

            <div className="border rounded-3 p-3" style={{ background: 'linear-gradient(180deg, #fffef7 0%, #ffffff 100%)' }}>
              <label className="form-label fw-semibold">Import Mode</label>
              <div className="d-flex flex-column gap-2">
                <div className="form-check">
                  <input
                    id="rdfImportModeMetadata"
                    className="form-check-input"
                    type="radio"
                    name="rdfImportMode"
                    checked={importMode === 'metadata_assets'}
                    onChange={() => setImportMode('metadata_assets')}
                    disabled={importBusy}
                  />
                  <label className="form-check-label" htmlFor="rdfImportModeMetadata">
                    Metadata and portable assets only
                  </label>
                </div>
                <div className="form-check">
                  <input
                    id="rdfImportModeFullNoAnnotations"
                    className="form-check-input"
                    type="radio"
                    name="rdfImportMode"
                    checked={importMode === 'full_project_without_annotations'}
                    onChange={() => setImportMode('full_project_without_annotations')}
                    disabled={importBusy}
                  />
                  <label className="form-check-label" htmlFor="rdfImportModeFullNoAnnotations">
                    Full OCRA project without annotations
                  </label>
                </div>
                <div className="form-check">
                  <input
                    id="rdfImportModeFullWithAnnotations"
                    className="form-check-input"
                    type="radio"
                    name="rdfImportMode"
                    checked={importMode === 'full_project_with_annotations'}
                    onChange={() => setImportMode('full_project_with_annotations')}
                    disabled={importBusy}
                  />
                  <label className="form-check-label" htmlFor="rdfImportModeFullWithAnnotations">
                    Full OCRA project with annotations
                  </label>
                </div>
              </div>
              <div className="form-text mt-2">
                If the RDF does not include an OCRA snapshot payload, the backend will fall back to metadata-only import or return a validation error for the selected mode.
              </div>
            </div>

            {file && (
              <div className="alert alert-light border mt-3 mb-0">
                <div className="fw-semibold">{file.name}</div>
                <div className="small text-muted">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
            )}

            {importError && (
              <div className="alert alert-danger mt-3 mb-0">
                {importError}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => !importBusy && onClose()} disabled={importBusy}>
              Cancel
            </button>
            <button type="button" className="btn btn-success" onClick={() => void handleImport()} disabled={importBusy}>
              {importBusy ? 'Importing...' : 'Create Project from RDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
