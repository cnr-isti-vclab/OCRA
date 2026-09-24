import { useEffect, useMemo } from 'react';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { allowsMultipleGeometrySelection } from './annotationCreationValidation';
import { hasPendingCreationDraftGeometry } from './creationDraftGeometry';
import { filterDataForCreationSearch, filterGeometriesForCreationSearch } from './filterCreationCandidates';
import { lastCreatedGeometryViewerId } from './rememberCreationSetup';
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
    isCreationGeometryStep && creationDraft?.geometryMode === 'new',
  );
  const isCreationGeometrySearch = Boolean(
    isCreationGeometryStep && creationDraft?.geometryMode === 'choose',
  );
  const isCreationDataNew = Boolean(isCreationDataStep && creationDraft?.dataMode === 'new');
  const isCreationDataSearch = Boolean(isCreationDataStep && creationDraft?.dataMode === 'choose');
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
    if (creationDraft?.geometryMode === 'new' && creationDraft.createdGeometries.length > 0) {
      // Highlight all drafts; editable focus stays on the last via viewer selection.
      return creationDraft.createdGeometries.map((entry) => entry.viewerId);
    }
    const lastId = lastCreatedGeometryViewerId(creationDraft);
    if (isCreationPendingNewGeometry && lastId) {
      return [lastId];
    }
    return null;
  }, [creationDraft, isCreationGeometrySearch, isCreationPendingNewGeometry]);

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
    setCreationDraftShapes,
    setCreationDraftGeometry,
    setCreationGeometrySelection,
    toggleCreationDataSelection,
  };
}
