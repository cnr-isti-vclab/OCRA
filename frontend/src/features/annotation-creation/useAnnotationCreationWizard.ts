import { useEffect, useMemo } from 'react';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { allowsMultipleGeometrySelection } from './annotationCreationValidation';
import { hasPendingCreationDraftGeometry } from './creationDraftGeometry';
import { filterDataForCreationSearch, filterGeometriesForCreationSearch } from './filterCreationCandidates';
import type { AnnotationCreationDraft } from './types';

export interface AnnotationCreationWizardState {
  creationDraft: Readonly<AnnotationCreationDraft> | null;
  isCreationWizardActive: boolean;
  isCreationGeometryStep: boolean;
  isCreationDataStep: boolean;
  isCreationGeometryNew: boolean;
  isCreationGeometrySearch: boolean;
  isCreationDataNew: boolean;
  isCreationDataSearch: boolean;
  isCreationPendingNewGeometry: boolean;
  allowsMultipleGeometry: boolean;
  searchableGeometries: ReturnType<typeof filterGeometriesForCreationSearch>;
  searchableData: ReturnType<typeof filterDataForCreationSearch>;
  creationHighlightGeometryIds: string[] | null;
  blockImmediateAnnotationCreate: boolean;
}

export function useAnnotationCreationWizard(): AnnotationCreationWizardState & {
  setCreationDraftShapes: (shapes: import('shared/annotation-types').AnnotationShape[]) => void;
  setCreationDraftGeometry: (viewerId: string, shapes: import('shared/annotation-types').AnnotationShape[]) => void;
  setCreationGeometrySelection: (geometryIds: string[]) => void;
  toggleCreationDataSelection: (dataId: string) => void;
} {
  const {
    creationDraft,
    isCreationWizardActive,
    allGeometries,
    allData,
    loadProjectData,
    setCreationDraftShapes,
    setCreationDraftGeometry,
    setCreationGeometrySelection,
    toggleCreationDataSelection,
  } = useAnnotationStore();

  const isCreationGeometryStep = creationDraft?.step === 'geometry';
  const isCreationDataStep = creationDraft?.step === 'data';
  const isCreationGeometryNew = Boolean(
    isCreationGeometryStep && creationDraft?.geometryChoice === 'new',
  );
  const isCreationGeometrySearch = Boolean(
    isCreationGeometryStep && creationDraft?.geometryChoice === 'search',
  );
  const isCreationDataNew = Boolean(isCreationDataStep && creationDraft?.dataChoice === 'new');
  const isCreationDataSearch = Boolean(isCreationDataStep && creationDraft?.dataChoice === 'search');
  const isCreationPendingNewGeometry = hasPendingCreationDraftGeometry(creationDraft);

  const allowsMultipleGeometry = creationDraft
    ? allowsMultipleGeometrySelection(creationDraft)
    : false;

  const searchableGeometries = useMemo(() => {
    if (!creationDraft || !isCreationGeometrySearch) {
      return [];
    }
    return filterGeometriesForCreationSearch(allGeometries, creationDraft);
  }, [allGeometries, creationDraft, isCreationGeometrySearch]);

  const searchableData = useMemo(() => {
    if (!creationDraft || !isCreationDataSearch) {
      return [];
    }
    return filterDataForCreationSearch(allData, creationDraft);
  }, [allData, creationDraft, isCreationDataSearch]);

  useEffect(() => {
    if (isCreationDataSearch) {
      void loadProjectData();
    }
  }, [isCreationDataSearch, loadProjectData]);

  const creationHighlightGeometryIds = useMemo(() => {
    if (isCreationGeometrySearch && creationDraft) {
      return [...creationDraft.selectedGeometryIds];
    }
    if (isCreationPendingNewGeometry && creationDraft?.draftGeometryViewerId) {
      return [creationDraft.draftGeometryViewerId];
    }
    return null;
  }, [creationDraft, isCreationGeometrySearch, isCreationPendingNewGeometry]);

  const blockImmediateAnnotationCreate = Boolean(
    isCreationWizardActive && !isCreationGeometryNew,
  );

  return {
    creationDraft,
    isCreationWizardActive,
    isCreationGeometryStep,
    isCreationDataStep,
    isCreationGeometryNew,
    isCreationGeometrySearch,
    isCreationDataNew,
    isCreationDataSearch,
    isCreationPendingNewGeometry,
    allowsMultipleGeometry,
    searchableGeometries,
    searchableData,
    creationHighlightGeometryIds,
    blockImmediateAnnotationCreate,
    setCreationDraftShapes,
    setCreationDraftGeometry,
    setCreationGeometrySelection,
    toggleCreationDataSelection,
  };
}
