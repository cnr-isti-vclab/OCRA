import { createPortal } from 'react-dom';
import type { AnnotationAppearance, AnnotationClassDisplay } from 'shared/annotation-types';
import type {
  VocabularyConcept,
  VocabularyProperty,
  VocabularyScheme,
} from '../../types/vocabulary';
import AnnotationClassPicker from '../../shared/ui/AnnotationClassPicker';
import AnnotationColorPicker from '../../shared/ui/AnnotationColorPicker';
import './AnnotationDataFormModal.css';

export interface AnnotationDataFormValues {
  label: string;
  description: string;
  annotationClass: string | null;
  annotationClassDisplay: AnnotationClassDisplay | null;
  appearance: AnnotationAppearance | null;
}

interface AnnotationDataFormModalProps {
  title: string;
  saveLabel: string;
  values: AnnotationDataFormValues;
  saveDisabled?: boolean;
  onChange: (patch: Partial<AnnotationDataFormValues>) => void;
  onSave: () => void;
  onCancel: () => void;
  vocabularySchemes: readonly VocabularyScheme[];
  vocabularyConcepts: readonly VocabularyConcept[];
  vocabularyProperties: readonly VocabularyProperty[];
}

export default function AnnotationDataFormModal({
  title,
  saveLabel,
  values,
  saveDisabled = false,
  onChange,
  onSave,
  onCancel,
  vocabularySchemes,
  vocabularyConcepts,
  vocabularyProperties,
}: AnnotationDataFormModalProps) {
  return createPortal(
    <div
      className="modal d-block annotation-data-form-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annotation-data-form-title"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'block',
      }}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="annotation-data-form-title">{title}</h5>
          </div>
          <div className="modal-body">
            <div className="mb-2">
              <label htmlFor="annotationLabel" className="form-label">
                Label
              </label>
              <input
                type="text"
                className="form-control"
                id="annotationLabel"
                value={values.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>
            <div className="mb-2">
              <label htmlFor="annotationDescription" className="form-label">
                Description
              </label>
              <textarea
                className="form-control"
                id="annotationDescription"
                value={values.description}
                onChange={(e) => onChange({ description: e.target.value })}
                rows={4}
                style={{ resize: 'vertical', overflowY: 'auto' }}
              />
            </div>
            <div className="mb-0">
              <label htmlFor="annotationClass" className="form-label">
                Classification
              </label>
              <p className="small text-muted mb-2">
                Choose a vocabulary and then a concept. The stable identifier is saved with the annotation;
                the readable label is retained for display.
              </p>
              <AnnotationClassPicker
                inputId="annotationClass"
                value={{
                  identifier: values.annotationClass,
                  display: values.annotationClassDisplay,
                }}
                onChange={(selection) => onChange({
                  annotationClass: selection.identifier,
                  annotationClassDisplay: selection.display,
                })}
                schemes={vocabularySchemes}
                concepts={vocabularyConcepts}
                properties={vocabularyProperties}
              />
            </div>
            <div className="mt-2">
              <label className="form-label">Annotation color</label>
              <p className="small text-muted mb-2">
                Optional display color passed to linked geometries. Choose a standard role or a custom color.
              </p>
              <AnnotationColorPicker
                value={values.appearance}
                onChange={(appearance) => onChange({ appearance })}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSave}
              disabled={saveDisabled}
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
