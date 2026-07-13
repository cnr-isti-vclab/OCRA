import type {
  VocabularyConcept,
  VocabularyProperty,
  VocabularyScheme,
} from '../../types/vocabulary';
import VocabularyClassPicker from '../../shared/ui/VocabularyClassPicker';

export interface AnnotationDataFormValues {
  label: string;
  description: string;
  annotationClass: string | null;
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
  return (
    <div
      className="modal d-block"
      role="dialog"
      aria-modal="true"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'block',
      }}
    >
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
          </div>
          <div className="modal-body">
            <div className="mb-3">
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
            <div className="mb-3">
              <label htmlFor="annotationDescription" className="form-label">
                Description
              </label>
              <textarea
                className="form-control"
                id="annotationDescription"
                value={values.description}
                onChange={(e) => onChange({ description: e.target.value })}
                rows={6}
                style={{ resize: 'vertical', overflowY: 'auto' }}
              />
            </div>
            <div className="mb-0">
              <label htmlFor="annotationClass" className="form-label">
                Class
              </label>
              <VocabularyClassPicker
                inputId="annotationClass"
                value={values.annotationClass ?? ''}
                onChange={(value) => onChange({ annotationClass: value })}
                schemes={vocabularySchemes}
                concepts={vocabularyConcepts}
                properties={vocabularyProperties}
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
    </div>
  );
}
