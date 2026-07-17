import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import type { AnnotationDeletionDraft } from './types';

export interface AnnotationDeletionWizardState {
  deletionDraft: Readonly<AnnotationDeletionDraft> | null;
  isDeletionWizardActive: boolean;
  isDeletionSetupStep: boolean;
  isDeletionSelectingStep: boolean;
}

export function useAnnotationDeletionWizard(): AnnotationDeletionWizardState {
  const { deletionDraft, isDeletionWizardActive } = useAnnotationStore();

  return {
    deletionDraft,
    isDeletionWizardActive,
    isDeletionSetupStep: deletionDraft?.step === 'setup',
    isDeletionSelectingStep: deletionDraft?.step === 'selecting',
  };
}
