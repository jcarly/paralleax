import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { useSearchParams } from 'react-router-dom';
import type { ReactFlowInstance } from '@xyflow/react';
import type { Position, Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import type { StoryGraphClickCreation } from '../../../storyGraphCreationLayout';
import { useStoryConnectionController } from './useStoryConnectionController';

function useStoryGraphCreationPosition(
  story: Story | undefined,
  interactionSizes: ReadonlyMap<string, { width: number; height: number }>,
) {
  return useCallback(
    async (creation: StoryGraphClickCreation) => {
      if (!story) {
        return undefined;
      }
      try {
        const { getStoryGraphClickCreationPosition } =
          await import('../../../storyGraphCreationLayout');
        return await getStoryGraphClickCreationPosition(story, creation, { interactionSizes });
      } catch {
        return undefined;
      }
    },
    [interactionSizes, story],
  );
}

type StoryEditorInteractionFocusInput = {
  story?: Story;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  appliedInitialFocusInteractionIdRef: React.MutableRefObject<string | undefined>;
  setPendingFocusInteractionId: Dispatch<SetStateAction<string | undefined>>;
  selectInteraction: (interactionId: string) => void;
};

function useStoryEditorInteractionFocus({
  story,
  loadPhase,
  searchParams,
  setSearchParams,
  appliedInitialFocusInteractionIdRef,
  setPendingFocusInteractionId,
  selectInteraction,
}: StoryEditorInteractionFocusInput) {
  const focusInteractionNode = useCallback(
    (interactionId: string) => {
      setPendingFocusInteractionId(interactionId);
      selectInteraction(interactionId);
    },
    [selectInteraction, setPendingFocusInteractionId],
  );
  const initialFocusInteractionId = searchParams.get('focusInteractionId');
  useEffect(() => {
    if (
      initialFocusInteractionId === null ||
      initialFocusInteractionId.length === 0 ||
      appliedInitialFocusInteractionIdRef.current === initialFocusInteractionId ||
      loadPhase !== 'ready' ||
      story?.interactions.some(({ id }) => id === initialFocusInteractionId) !== true
    ) {
      return;
    }
    appliedInitialFocusInteractionIdRef.current = initialFocusInteractionId;
    focusInteractionNode(initialFocusInteractionId);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('focusInteractionId');
    setSearchParams(nextSearchParams, { replace: true });
  }, [
    appliedInitialFocusInteractionIdRef,
    focusInteractionNode,
    initialFocusInteractionId,
    loadPhase,
    searchParams,
    setSearchParams,
    story?.interactions,
  ]);
  return focusInteractionNode;
}

type StoryEditorRelatedCreationInput = {
  createChildFromInteraction: ReturnType<
    typeof useStoryEditorPersistence
  >['createChildFromInteraction'];
  createParentForInteraction: ReturnType<
    typeof useStoryEditorPersistence
  >['createParentForInteraction'];
  getClickCreationPosition: ReturnType<typeof useStoryGraphCreationPosition>;
  focusInteractionNode: (interactionId: string) => void;
};

export function useStoryEditorRelatedCreation({
  createChildFromInteraction,
  createParentForInteraction,
  getClickCreationPosition,
  focusInteractionNode,
}: StoryEditorRelatedCreationInput) {
  const createChildAndFocus = useCallback(
    async (sourceId: string, position?: Position) => {
      const interactionId = await createChildFromInteraction(
        sourceId,
        position ?? (await getClickCreationPosition({ kind: 'child', sourceId })),
      );
      if (interactionId !== undefined && interactionId.length > 0) {
        focusInteractionNode(interactionId);
      }
    },
    [createChildFromInteraction, focusInteractionNode, getClickCreationPosition],
  );
  const createParentAndFocus = useCallback(
    async (targetId: string, position?: Position) => {
      const interactionId = await createParentForInteraction(
        targetId,
        position ?? (await getClickCreationPosition({ kind: 'parent', targetId })),
      );
      if (interactionId !== undefined && interactionId.length > 0) {
        focusInteractionNode(interactionId);
      }
    },
    [createParentForInteraction, focusInteractionNode, getClickCreationPosition],
  );
  return { createChildAndFocus, createParentAndFocus };
}

type StoryEditorConnectionRuntimeInput = {
  story?: Story;
  interactionSizes: ReadonlyMap<string, { width: number; height: number }>;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  appliedInitialFocusInteractionIdRef: React.MutableRefObject<string | undefined>;
  setPendingFocusInteractionId: Dispatch<SetStateAction<string | undefined>>;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
  selectInteraction: (interactionId: string) => void;
  createChildFromInteraction: ReturnType<
    typeof useStoryEditorPersistence
  >['createChildFromInteraction'];
  createParentForInteraction: ReturnType<
    typeof useStoryEditorPersistence
  >['createParentForInteraction'];
  connectInteractions: ReturnType<typeof useStoryEditorPersistence>['connectInteractions'];
  connectToExistingTrigger: ReturnType<
    typeof useStoryEditorPersistence
  >['connectToExistingTrigger'];
  setConnectionConflict: Dispatch<SetStateAction<boolean>>;
  reportSaveError: ReturnType<typeof useStoryEditorPersistence>['reportSaveError'];
};

export function useStoryEditorConnectionRuntime(input: StoryEditorConnectionRuntimeInput) {
  const getClickCreationPosition = useStoryGraphCreationPosition(
    input.story,
    input.interactionSizes,
  );
  const focusInteractionNode = useStoryEditorInteractionFocus({
    story: input.story,
    loadPhase: input.loadPhase,
    searchParams: input.searchParams,
    setSearchParams: input.setSearchParams,
    appliedInitialFocusInteractionIdRef: input.appliedInitialFocusInteractionIdRef,
    setPendingFocusInteractionId: input.setPendingFocusInteractionId,
    selectInteraction: input.selectInteraction,
  });
  const relatedCreation = useStoryEditorRelatedCreation({
    createChildFromInteraction: input.createChildFromInteraction,
    createParentForInteraction: input.createParentForInteraction,
    getClickCreationPosition,
    focusInteractionNode,
  });
  const connectionController = useStoryConnectionController({
    story: input.story,
    flowInstanceRef: input.flowInstanceRef,
    connectInteractions: input.connectInteractions,
    connectToExistingTrigger: input.connectToExistingTrigger,
    onConnectionConflict: input.setConnectionConflict,
    onUnexpectedError: input.reportSaveError,
    createChildFromInteraction: relatedCreation.createChildAndFocus,
    createParentForInteraction: relatedCreation.createParentAndFocus,
  });
  return {
    getClickCreationPosition,
    focusInteractionNode,
    ...relatedCreation,
    connectionController,
  };
}

export function useStoryEditorRootCreation(
  createRoot: ReturnType<typeof useStoryEditorPersistence>['createRoot'],
  getClickCreationPosition: ReturnType<typeof useStoryGraphCreationPosition>,
  focusInteractionNode: (interactionId: string) => void,
) {
  return useCallback(
    async (position?: Position) => {
      const interactionId = await createRoot(
        position ?? (await getClickCreationPosition({ kind: 'root' })),
      );
      if (interactionId !== undefined && interactionId.length > 0) {
        focusInteractionNode(interactionId);
      }
    },
    [createRoot, focusInteractionNode, getClickCreationPosition],
  );
}
