import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AnnotationData, AnnotationGeometry } from 'shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { updateTrashSelection } from './trashSelection';

interface AnnotationTrashContextValue {
  isOpen: boolean;
  erasableGeometries: AnnotationGeometry[];
  erasableData: AnnotationData[];
  selectedGeometryIds: ReadonlySet<string>;
  selectedDataIds: ReadonlySet<string>;
  viewerSelectionGeometryIds: string[];
  openTrash: () => void;
  closeTrash: () => void;
  selectGeometry: (geometryId: string, additive: boolean) => void;
  selectData: (dataId: string, additive: boolean) => void;
  clearGeometrySelection: () => void;
  clearDataSelection: () => void;
  setViewerGeometrySelection: (geometryIds: Iterable<string>) => void;
  restoreSelection: () => Promise<void>;
}

const AnnotationTrashContext = createContext<AnnotationTrashContextValue | null>(null);

/** Owns the reusable restore workflow shared by annotation panels and 2D/3D viewers. */
export function AnnotationTrashProvider({ children }: { children: ReactNode }) {
  const {
    allGeometries,
    allData,
    allLinks,
    setShowErased,
    setLinkViewMode,
    clearFocus,
    markGeometryNonErasable,
    markDataNonErasable,
  } = useAnnotationStore();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedGeometryIds, setSelectedGeometryIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedDataIds, setSelectedDataIds] = useState<ReadonlySet<string>>(new Set());

  const erasableGeometries = useMemo(
    () => allGeometries.filter((geometry) => geometry.erasableAt !== null),
    [allGeometries],
  );
  const erasableData = useMemo(
    () => allData.filter((datum) => datum.erasableAt !== null),
    [allData],
  );

  const openTrash = useCallback(() => {
    clearFocus();
    setLinkViewMode('showAll');
    setShowErased(true);
    setSelectedGeometryIds(new Set());
    setSelectedDataIds(new Set());
    setIsOpen(true);
  }, [clearFocus, setLinkViewMode, setShowErased]);

  const closeTrash = useCallback(() => {
    setIsOpen(false);
    setSelectedGeometryIds(new Set());
    setSelectedDataIds(new Set());
    setShowErased(false);
    clearFocus();
  }, [clearFocus, setShowErased]);

  useEffect(() => () => setShowErased(false), [setShowErased]);

  const selectGeometry = useCallback((geometryId: string, additive: boolean) => {
    setSelectedGeometryIds((current) => updateTrashSelection(current, geometryId, additive));
  }, []);

  const selectData = useCallback((dataId: string, additive: boolean) => {
    setSelectedDataIds((current) => updateTrashSelection(current, dataId, additive));
  }, []);

  const clearGeometrySelection = useCallback(() => setSelectedGeometryIds(new Set()), []);
  const clearDataSelection = useCallback(() => setSelectedDataIds(new Set()), []);

  const erasableGeometryIdSet = useMemo(
    () => new Set(erasableGeometries.map((geometry) => geometry.id)),
    [erasableGeometries],
  );

  const setViewerGeometrySelection = useCallback((geometryIds: Iterable<string>) => {
    setSelectedGeometryIds(
      new Set([...geometryIds].filter((geometryId) => erasableGeometryIdSet.has(geometryId))),
    );
  }, [erasableGeometryIdSet]);

  const viewerSelectionGeometryIds = useMemo(() => {
    const ids = new Set(selectedGeometryIds);
    for (const link of allLinks) {
      if (selectedDataIds.has(link.dataId) && erasableGeometryIdSet.has(link.geometryId)) {
        ids.add(link.geometryId);
      }
    }
    return [...ids];
  }, [allLinks, erasableGeometryIdSet, selectedDataIds, selectedGeometryIds]);

  const restoreSelection = useCallback(async () => {
    await Promise.all([
      ...[...selectedGeometryIds].map((id) => markGeometryNonErasable(id)),
      ...[...selectedDataIds].map((id) => markDataNonErasable(id)),
    ]);
    setSelectedGeometryIds(new Set());
    setSelectedDataIds(new Set());
  }, [markDataNonErasable, markGeometryNonErasable, selectedDataIds, selectedGeometryIds]);

  const value = useMemo<AnnotationTrashContextValue>(() => ({
    isOpen,
    erasableGeometries,
    erasableData,
    selectedGeometryIds,
    selectedDataIds,
    viewerSelectionGeometryIds,
    openTrash,
    closeTrash,
    clearDataSelection,
    clearGeometrySelection,
    selectGeometry,
    selectData,
    setViewerGeometrySelection,
    restoreSelection,
  }), [
    closeTrash,
    clearDataSelection,
    clearGeometrySelection,
    erasableData,
    erasableGeometries,
    isOpen,
    openTrash,
    restoreSelection,
    selectedDataIds,
    selectedGeometryIds,
    setViewerGeometrySelection,
    selectData,
    selectGeometry,
    viewerSelectionGeometryIds,
  ]);

  return <AnnotationTrashContext.Provider value={value}>{children}</AnnotationTrashContext.Provider>;
}

/** Access the annotation trash workflow from panels or viewer adapters. */
export function useAnnotationTrash(): AnnotationTrashContextValue {
  const context = useContext(AnnotationTrashContext);
  if (!context) throw new Error('useAnnotationTrash must be used within AnnotationTrashProvider');
  return context;
}
