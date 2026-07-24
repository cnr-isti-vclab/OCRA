import { useEffect, useMemo } from 'react';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { canConfirmDeletionBasket } from './annotationDeletionBasket';
import { resolveDeletionLinkViewMode } from './annotationDeletionCardinality';
import { resolveDeletionHighlightIds } from './resolveDeletionHighlightIds';
import type { AnnotationDeletionDraft } from './types';
import type { DeletionBasketAddResult } from '../../stores/AnnotationStore';

export interface AnnotationDeletionWizardState {
  deletionDraft: Readonly<AnnotationDeletionDraft> | null;
  isDeletionWizardActive: boolean;
  isDeletionSetupStep: boolean;
  isDeletionSelectingStep: boolean;
  isDeletionLinkOnly: boolean;
  isDeletionGeometryLed: boolean;
  isDeletionDataLed: boolean;
  /** True while picking geometries in the viewer for data-led Let-me-select. */
  isDeletionGeometryPickActive: boolean;
  deletionHighlightGeometryIds: string[] | null;
  deletionHighlightDataIds: string[] | null;
  canConfirmDeletion: boolean;
}

export function useAnnotationDeletionWizard(): AnnotationDeletionWizardState & {
  addGeometryToDeletionBasket: (geometryId: string) => DeletionBasketAddResult;
  addDataToDeletionBasket: (dataId: string) => DeletionBasketAddResult;
  addLinkOnlyFromEndpoint: (
    endpointKind: 'geometry' | 'data',
    endpointId: string,
  ) => DeletionBasketAddResult;
  deselectGeometryFromDeletionBasket: (geometryId: string) => void;
  deselectDataFromDeletionBasket: (dataId: string) => void;
  clearDeletionBasket: () => void;
  removeFromDeletionBasket: (args: {
    linkId?: string;
    geometryId?: string;
    dataId?: string;
  }) => void;
  confirmDeletionPendingAll: () => void;
  cancelDeletionPendingResolution: () => void;
  beginDeletionCounterpartPick: () => void;
  setDeletionCounterpartSelection: (counterpartIds: string[]) => void;
  toggleDeletionCounterpartSelection: (counterpartId: string) => void;
  confirmDeletionCounterpartPick: () => void;
  reportDeletionSelectionBlocked: (message: string) => void;
  commitDeletionDraft: () => Promise<{ ok: true; message?: string } | { ok: false; message: string }>;
} {
  const {
    deletionDraft,
    isDeletionWizardActive,
    allLinks,
    linkViewMode,
    setLinkViewMode,
    addGeometryToDeletionBasket,
    addDataToDeletionBasket,
    addLinkOnlyFromEndpoint,
    deselectGeometryFromDeletionBasket,
    deselectDataFromDeletionBasket,
    clearDeletionBasket,
    removeFromDeletionBasket,
    confirmDeletionPendingAll,
    cancelDeletionPendingResolution,
    beginDeletionCounterpartPick,
    setDeletionCounterpartSelection,
    toggleDeletionCounterpartSelection,
    confirmDeletionCounterpartPick,
    reportDeletionSelectionBlocked,
    commitDeletionDraft,
  } = useAnnotationStore();

  const isDeletionSetupStep = deletionDraft?.step === 'setup';
  const isDeletionSelectingStep = deletionDraft?.step === 'selecting';
  const isDeletionLinkOnly = Boolean(
    deletionDraft
    && deletionDraft.deleteLink
    && !deletionDraft.deleteGeometry
    && !deletionDraft.deleteData,
  );
  const isDeletionGeometryLed = Boolean(deletionDraft?.deleteGeometry);
  const isDeletionDataLed = Boolean(deletionDraft?.deleteData && !deletionDraft.deleteGeometry);
  const isDeletionGeometryPickActive = Boolean(
    deletionDraft?.pendingResolution?.modal === 'pickCounterparts'
    && deletionDraft.pendingResolution.endpointKind === 'data',
  );

  const canConfirmDeletion = useMemo(() => {
    if (!deletionDraft || deletionDraft.step !== 'selecting') {
      return false;
    }
    return canConfirmDeletionBasket(deletionDraft, { links: allLinks });
  }, [allLinks, deletionDraft]);

  const deletionHighlights = useMemo(() => {
    if (!isDeletionSelectingStep || !deletionDraft) {
      return null;
    }
    return resolveDeletionHighlightIds(deletionDraft, allLinks);
  }, [allLinks, deletionDraft, isDeletionSelectingStep]);

  const deletionHighlightGeometryIds = deletionHighlights?.geometryIds ?? null;
  const deletionHighlightDataIds = deletionHighlights?.dataIds ?? null;

  useEffect(() => {
    if (!deletionDraft || deletionDraft.step !== 'selecting') {
      return;
    }
    const nextMode = resolveDeletionLinkViewMode(deletionDraft);
    if (linkViewMode !== nextMode) {
      setLinkViewMode(nextMode);
    }
  }, [deletionDraft, linkViewMode, setLinkViewMode]);

  return {
    deletionDraft,
    isDeletionWizardActive,
    isDeletionSetupStep,
    isDeletionSelectingStep,
    isDeletionLinkOnly,
    isDeletionGeometryLed,
    isDeletionDataLed,
    isDeletionGeometryPickActive,
    deletionHighlightGeometryIds,
    deletionHighlightDataIds,
    canConfirmDeletion,
    addGeometryToDeletionBasket,
    addDataToDeletionBasket,
    addLinkOnlyFromEndpoint,
    deselectGeometryFromDeletionBasket,
    deselectDataFromDeletionBasket,
    clearDeletionBasket,
    removeFromDeletionBasket,
    confirmDeletionPendingAll,
    cancelDeletionPendingResolution,
    beginDeletionCounterpartPick,
    setDeletionCounterpartSelection,
    toggleDeletionCounterpartSelection,
    confirmDeletionCounterpartPick,
    reportDeletionSelectionBlocked,
    commitDeletionDraft,
  };
}
