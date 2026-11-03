import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { StoryGroupRootDrop } from './StoryGroupRootDrop';
import { StoryGroupTreeRows } from './StoryGroupTreeRows';
import { UngroupedInteractionList } from './UngroupedInteractionList';
import type { useGroupTreeDrag } from './useGroupTreeDrag';
import type { useGroupTreeCommands } from './useGroupTreeCommands';
import type { useGroupTreeNavigation } from './useGroupTreeNavigation';
import type { StoryGroupsPanelProps } from './storyGroupTypes';

type Navigation = ReturnType<typeof useGroupTreeNavigation>;
type Commands = ReturnType<typeof useGroupTreeCommands>;
type Drag = ReturnType<typeof useGroupTreeDrag>;

export function StoryGroupTreeContent({
  props,
  navigation,
  commands,
  drag,
}: {
  props: StoryGroupsPanelProps;
  navigation: Navigation;
  commands: Commands;
  drag: Drag;
}) {
  const { t } = useTranslation();
  const noResults = getNoResultsKey(navigation);
  return (
    <>
      <StoryGroupTreeDndArea
        props={props}
        navigation={navigation}
        commands={commands}
        drag={drag}
      />
      {noResults ? <p className="hint">{t(noResults)}</p> : null}
      <p id="group-keyboard-help" className="visually-hidden">
        {t('editor.groups.keyboardHelp')}
      </p>
    </>
  );
}

function StoryGroupTreeDndArea({
  props,
  navigation,
  commands,
  drag,
}: {
  props: StoryGroupsPanelProps;
  navigation: Navigation;
  commands: Commands;
  drag: Drag;
}) {
  const { t } = useTranslation();
  const groupKeyDown = navigation.createGroupKeyDown(commands.moveGroup);
  const rowProps = createTreeRowProps({ props, navigation, commands, drag, groupKeyDown });
  return (
    <DndContext
      sensors={drag.sensors}
      collisionDetection={pointerWithin}
      autoScroll={{ threshold: { x: 0.2, y: 0.04 } }}
      accessibility={{
        screenReaderInstructions: { draggable: t('editor.groups.keyboardHelp') },
        announcements: createDragAnnouncements(t),
      }}
      onDragStart={drag.onDragStart}
      onDragMove={drag.onDragMove}
      onDragOver={drag.onDragOver}
      onDragEnd={drag.onDragEnd}
      onDragCancel={drag.onDragCancel}
    >
      <StoryGroupTreeRows {...rowProps} />
      <UngroupedInteractionList
        interactions={navigation.ungroupedInteractions}
        searchQuery={props.searchQuery}
        matchingInteractionIds={navigation.matchingInteractionIds}
        selectedInteractionId={props.selectedInteractionId}
        onSelect={props.onSelectInteraction}
      />
      <StoryGroupRootDrop
        active={Boolean(drag.activeId)}
        highlighted={drag.target?.position === 'root'}
        label={t('editor.groups.moveToRoot')}
      />
      <GroupDragOverlay activeId={drag.activeId} navigation={navigation} />
    </DndContext>
  );
}

function createTreeRowProps({
  props,
  navigation,
  commands,
  drag,
  groupKeyDown,
}: {
  props: StoryGroupsPanelProps;
  navigation: Navigation;
  commands: Commands;
  drag: Drag;
  groupKeyDown: ReturnType<Navigation['createGroupKeyDown']>;
}) {
  return {
    entries: navigation.entries,
    tree: navigation.tree,
    groups: navigation.groups,
    matchingInteractionIds: navigation.matchingInteractionIds,
    liveInteractionIds: navigation.liveInteractionIds,
    selectedGroupId: props.selectedGroupId,
    selectedInteractionId: props.selectedInteractionId,
    editingGroupId: props.editingGroupId,
    readOnly: props.readOnly,
    busy: commands.busy,
    activeId: drag.activeId,
    target: drag.target,
    isExpanded: navigation.isExpanded,
    onToggle: navigation.toggle,
    onSelectGroup: props.onSelect,
    onSelectInteraction: props.onSelectInteraction,
    onFocusGroup: props.onFocus,
    onMenu: (groupId: string, position: { x: number; y: number }) =>
      navigation.setMenu({ groupId, position }),
    onRename: (groupId: string, title: string) =>
      commands.mutate(() => props.onUpdate(groupId, { title })),
    onRenameComplete: (groupId: string, restoreFocus: boolean) => {
      if (restoreFocus) {
        navigation.restoreFocusGroupId.current = groupId;
      }
      props.onEditingChange(undefined);
    },
    onGroupKeyDown: groupKeyDown,
    onInteractionKeyDown: navigation.interactionKeyDown,
    onFocusRow: navigation.focusRow,
  };
}

function GroupDragOverlay({ activeId, navigation }: { activeId?: string; navigation: Navigation }) {
  return createPortal(
    <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
      {activeId ? (
        <div className="story-group-drag-preview">{navigation.tree.byId.get(activeId)?.title}</div>
      ) : null}
    </DragOverlay>,
    document.body,
  );
}

function createDragAnnouncements(t: ReturnType<typeof useTranslation>['t']) {
  return {
    onDragStart: () => t('editor.groups.dragStarted'),
    onDragOver: ({ over }: { over: unknown }) =>
      over ? t('editor.groups.dropPreview') : undefined,
    onDragEnd: () => t('editor.groups.dragEnded'),
    onDragCancel: () => t('editor.groups.dragCancelled'),
  };
}

function getNoResultsKey(navigation: Navigation) {
  if (!navigation.tree.searching) {
    return undefined;
  }
  if (navigation.entries.length || navigation.ungroupedMatchCount) {
    return undefined;
  }
  return 'editor.groups.noMatches' as const;
}
