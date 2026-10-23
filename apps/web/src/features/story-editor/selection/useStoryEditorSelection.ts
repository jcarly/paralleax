import { useCallback, useMemo, useRef, useState } from 'react';
import { getGroupInteractionIds, type CommentTargetType, type Story } from '@paralleax/shared';
import type { OnSelectionChangeParams } from '@xyflow/react';
import type { SelectedTrigger, StoryFlowNode } from '../../../storyGraph';
import {
  createStoryGraphSelection,
  getStoryGraphSelectionNodeIds,
  type StoryGraphSelection,
} from '../../../storyGraphSelection';
import type { StoryContextReference } from '../../../storyNavigation';
import { findInteraction, findSelectedTrigger } from '../../../storySelection';

export type StoryEditorExclusiveSelection =
  | { type: 'group'; id: string }
  | { type: 'interaction'; id: string }
  | { type: 'trigger'; trigger: SelectedTrigger }
  | { type: 'graphDecoration'; id: string }
  | { type: 'location'; id: string }
  | { type: 'character'; id: string }
  | { type: 'statDefinition'; id: string }
  | { type: 'itemDefinition'; id: string }
  | { type: 'statDefinitionCreation' };

export function useStoryEditorSelection(story: Story | undefined) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedTrigger, setSelectedTrigger] = useState<SelectedTrigger>();
  const [selectedGraphDecorationId, setSelectedGraphDecorationId] = useState<string>();
  const [selectedLocationId, setSelectedLocationId] = useState<string>();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>();
  const [selectedStatDefinitionId, setSelectedStatDefinitionId] = useState<string>();
  const [selectedItemDefinitionId, setSelectedItemDefinitionId] = useState<string>();
  const [isCreatingStatDefinition, setIsCreatingStatDefinition] = useState(false);
  const [graphSelection, setGraphSelection] = useState<StoryGraphSelection | undefined>(undefined);
  const graphSelectionGesture = useRef(false);
  const graphSelectionCandidate = useRef<StoryGraphSelection | undefined>(undefined);

  const selectExclusive = useCallback((selection?: StoryEditorExclusiveSelection) => {
    setGraphSelection(undefined);
    setSelectedGroupId(selection?.type === 'group' ? selection.id : undefined);
    setSelectedId(selection?.type === 'interaction' ? selection.id : undefined);
    setSelectedTrigger(selection?.type === 'trigger' ? selection.trigger : undefined);
    setSelectedGraphDecorationId(selection?.type === 'graphDecoration' ? selection.id : undefined);
    setSelectedLocationId(selection?.type === 'location' ? selection.id : undefined);
    setSelectedCharacterId(selection?.type === 'character' ? selection.id : undefined);
    setSelectedStatDefinitionId(selection?.type === 'statDefinition' ? selection.id : undefined);
    setSelectedItemDefinitionId(selection?.type === 'itemDefinition' ? selection.id : undefined);
    setIsCreatingStatDefinition(selection?.type === 'statDefinitionCreation');
  }, []);

  const focusInteraction = useCallback((interactionId: string) => {
    setGraphSelection(undefined);
    setSelectedTrigger(undefined);
    setSelectedGroupId(undefined);
    setSelectedId(interactionId);
  }, []);

  const selectInteraction = useCallback(
    (interactionId: string) => selectExclusive({ type: 'interaction', id: interactionId }),
    [selectExclusive],
  );

  const clearSelection = useCallback(() => selectExclusive(), [selectExclusive]);

  const gestureBase = useRef<StoryGraphSelection | undefined>(undefined);
  const gestureMode = useRef<'replace' | 'add' | 'remove'>('replace');
  const selectGraphInteractions = useCallback(
    (interactionIds: string[], triggers: StoryGraphSelection['triggers'] = []) => {
      selectExclusive();
      setGraphSelection(
        interactionIds.length || triggers.length ? { interactionIds, triggers } : undefined,
      );
    },
    [selectExclusive],
  );

  const handleGraphSelectionStart = useCallback(
    (event?: { shiftKey: boolean; altKey: boolean }) => {
      gestureBase.current =
        graphSelection ?? (selectedId ? { interactionIds: [selectedId], triggers: [] } : undefined);
      gestureMode.current = event?.altKey ? 'remove' : event?.shiftKey ? 'add' : 'replace';
      graphSelectionGesture.current = true;
      graphSelectionCandidate.current = undefined;
      selectExclusive();
    },
    [graphSelection, selectedId, selectExclusive],
  );

  const handleGraphSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams<StoryFlowNode>) => {
      if (!graphSelectionGesture.current) return;
      graphSelectionCandidate.current = createStoryGraphSelection(nodes);
    },
    [],
  );

  const handleGraphSelectionEnd = useCallback(() => {
    graphSelectionGesture.current = false;
    const candidate = graphSelectionCandidate.current;
    const base = gestureBase.current;
    const mode = gestureMode.current;
    if (mode === 'replace' || !base) setGraphSelection(mode === 'remove' ? base : candidate);
    else {
      const ids = new Set(candidate?.interactionIds ?? []);
      const triggers = new Set(candidate?.triggers.map(({ nodeId }) => nodeId) ?? []);
      const next = {
        interactionIds:
          mode === 'add'
            ? [...new Set([...base.interactionIds, ...ids])]
            : base.interactionIds.filter((id) => !ids.has(id)),
        triggers:
          mode === 'add'
            ? [
                ...base.triggers.filter(({ nodeId }) => !triggers.has(nodeId)),
                ...(candidate?.triggers ?? []),
              ]
            : base.triggers.filter(({ nodeId }) => !triggers.has(nodeId)),
      };
      setGraphSelection(next.interactionIds.length || next.triggers.length ? next : undefined);
    }
    graphSelectionCandidate.current = undefined;
  }, []);

  const selected = findInteraction(story, selectedId);
  const selectedTriggerTarget = findSelectedTrigger(story, selectedTrigger);
  const selectedGraphDecoration = story?.graphDecorations?.find(
    ({ id }) => id === selectedGraphDecorationId,
  );
  const selectedLocation = story?.locations?.find(({ id }) => id === selectedLocationId);
  const selectedCharacter = story?.characters?.find(({ id }) => id === selectedCharacterId);
  const selectedStatDefinition = story?.statDefinitions?.find(
    ({ id }) => id === selectedStatDefinitionId,
  );
  const selectedItemDefinition = story?.itemDefinitions?.find(
    ({ id }) => id === selectedItemDefinitionId,
  );
  const selectedGraphNodeIds = useMemo(
    () => getStoryGraphSelectionNodeIds(graphSelection),
    [graphSelection],
  );
  const selectedContextReference: StoryContextReference | undefined = useMemo(
    () =>
      selectedLocationId
        ? { type: 'location', id: selectedLocationId }
        : selectedCharacterId
          ? { type: 'character', id: selectedCharacterId }
          : selectedStatDefinitionId
            ? { type: 'stat', id: selectedStatDefinitionId }
            : selectedItemDefinitionId
              ? { type: 'item', id: selectedItemDefinitionId }
              : undefined,
    [selectedCharacterId, selectedItemDefinitionId, selectedLocationId, selectedStatDefinitionId],
  );
  const selectedCommentTarget: { targetType: CommentTargetType; targetId: string } | undefined =
    selected
      ? { targetType: 'interaction', targetId: selected.id }
      : selectedTriggerTarget
        ? { targetType: 'trigger', targetId: selectedTriggerTarget.trigger.id }
        : selectedLocation
          ? { targetType: 'location', targetId: selectedLocation.id }
          : selectedCharacter
            ? { targetType: 'character', targetId: selectedCharacter.id }
            : selectedStatDefinition
              ? { targetType: 'statDefinition', targetId: selectedStatDefinition.id }
              : selectedItemDefinition
                ? { targetType: 'itemDefinition', targetId: selectedItemDefinition.id }
                : undefined;
  const hasInspectorSelection = Boolean(
    graphSelection ||
    selected ||
    selectedTriggerTarget ||
    selectedGraphDecoration ||
    selectedLocation ||
    selectedCharacter ||
    selectedStatDefinition ||
    isCreatingStatDefinition ||
    selectedItemDefinition,
  );

  const selectedGroup = story?.groups?.find(({ id }) => id === selectedGroupId);
  const groupInteractionIds = useMemo(
    () =>
      selectedGroup && story
        ? new Set(
            getGroupInteractionIds(story.groups ?? [], selectedGroup.id).filter((id) =>
              story.interactions.some((interaction) => interaction.id === id),
            ),
          )
        : undefined,
    [selectedGroup, story],
  );

  return {
    selectedGroupId: selectedGroup?.id,
    groupInteractionIds,
    selectGraphInteractions,
    selectedId,
    selectedTrigger,
    selectedGraphDecorationId,
    selectedLocationId,
    selectedCharacterId,
    selectedStatDefinitionId,
    selectedItemDefinitionId,
    isCreatingStatDefinition,
    graphSelection,
    selected,
    selectedTriggerTarget,
    selectedGraphDecoration,
    selectedLocation,
    selectedCharacter,
    selectedStatDefinition,
    selectedItemDefinition,
    selectedGraphNodeIds,
    selectedContextReference,
    selectedCommentTarget,
    hasInspectorSelection,
    selectExclusive,
    selectInteraction,
    focusInteraction,
    clearSelection,
    handleGraphSelectionStart,
    handleGraphSelectionChange,
    handleGraphSelectionEnd,
  };
}
