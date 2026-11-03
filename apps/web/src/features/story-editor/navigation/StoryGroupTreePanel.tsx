import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Group } from '@paralleax/shared';
import { StoryContextSectionHeader } from './StoryContextSectionHeader';
import { StoryGroupContextMenu } from './StoryGroupContextMenu';
import { StoryGroupTreeContent } from './StoryGroupTreeContent';
import { useGroupTreeCommands } from './useGroupTreeCommands';
import { useGroupTreeDrag } from './useGroupTreeDrag';
import { useGroupTreeNavigation } from './useGroupTreeNavigation';
import type { StoryGroupsPanelProps } from './storyGroupTypes';

export { type StoryGroupsPanelProps } from './storyGroupTypes';

export function StoryGroupTreePanel(props: StoryGroupsPanelProps) {
  const { t } = useTranslation();
  const panel = useRef<HTMLElement>(null);
  const navigation = useGroupTreeNavigation(props, panel);
  const commands = useGroupTreeCommands(
    props,
    navigation.tree,
    navigation.setExpandedIds,
    navigation.focusRow,
  );
  const drag = useGroupTreeDrag({
    groups: navigation.groups,
    panel,
    updateGroup: props.onUpdate,
    mutate: commands.mutate,
    expandGroup: commands.expandGroup,
    closeMenu: () => navigation.setMenu(undefined),
  });

  return (
    <section
      ref={panel}
      className="story-groups-panel"
      aria-label={t('editor.groups.title')}
      {...drag.pointerHandlers}
    >
      <GroupTreeHeader props={props} navigation={navigation} />
      {navigation.open ? (
        <StoryGroupTreeContent
          props={props}
          navigation={navigation}
          commands={commands}
          drag={drag}
        />
      ) : null}
      <p role="status" className="hint">
        {commands.message}
      </p>
      <StoryGroupMenuController props={props} navigation={navigation} commands={commands} />
    </section>
  );
}

function GroupTreeHeader({
  props,
  navigation,
}: {
  props: StoryGroupsPanelProps;
  navigation: ReturnType<typeof useGroupTreeNavigation>;
}) {
  const { t } = useTranslation();
  return (
    <StoryContextSectionHeader
      title={t('editor.groups.title')}
      count={navigation.groups.length}
      countLabel={t('editor.groups.count', { count: navigation.groups.length })}
      expanded={navigation.open}
      onToggle={props.onToggle}
      toggleDisabled={Boolean(props.editingGroupId)}
      add={getAddButtonProps(props, t('editor.groups.add'))}
    />
  );
}

function getAddButtonProps(props: StoryGroupsPanelProps, label: string) {
  if (props.readOnly) {
    return undefined;
  }
  return {
    accessibleName: label,
    onClick: props.onAdd,
    disabled: Boolean(props.editingGroupId),
  };
}

function StoryGroupMenuController({
  props,
  navigation,
  commands,
}: {
  props: StoryGroupsPanelProps;
  navigation: ReturnType<typeof useGroupTreeNavigation>;
  commands: ReturnType<typeof useGroupTreeCommands>;
}) {
  const { t } = useTranslation();
  const group = navigation.tree.byId.get(navigation.menu?.groupId ?? '');
  const interactionIds = group ? commands.groupInteractionIds(group.id) : [];
  return (
    <StoryGroupContextMenu
      menu={navigation.menu}
      group={group}
      siblingGroups={navigation.tree.children.get(group?.parentGroupId) ?? []}
      interactionIds={interactionIds}
      props={props}
      onClose={() => navigation.setMenu(undefined)}
      onRename={(groupId) => props.onEditingChange(groupId)}
      onCreateChild={(groupId) => {
        void commands.mutate(() => props.onCreate(t('editor.groups.newGroup'), [], groupId));
      }}
      onAddSelection={(target) => addSelectionToGroup(target, props, commands)}
      onRemoveSelection={(target) => removeSelectionFromGroup(target, props, commands)}
      onSelectInteractions={props.onSelectInteractions}
      onFocus={props.onFocus}
      onMove={commands.moveGroup}
      onMoveToRoot={(groupId) => moveGroupToRoot(groupId, props, commands)}
      onDelete={(groupId) => {
        void commands.mutate(() => props.onDelete(groupId));
      }}
    />
  );
}

function addSelectionToGroup(
  group: Group,
  props: StoryGroupsPanelProps,
  commands: ReturnType<typeof useGroupTreeCommands>,
) {
  const interactionIds = [...new Set([...group.interactionIds, ...props.selectionIds])];
  void commands.mutate(() => props.onUpdate(group.id, { interactionIds }));
}

function removeSelectionFromGroup(
  group: Group,
  props: StoryGroupsPanelProps,
  commands: ReturnType<typeof useGroupTreeCommands>,
) {
  const interactionIds = group.interactionIds.filter((id) => !props.selectionIds.includes(id));
  void commands.mutate(() => props.onUpdate(group.id, { interactionIds }));
}

function moveGroupToRoot(
  groupId: string,
  props: StoryGroupsPanelProps,
  commands: ReturnType<typeof useGroupTreeCommands>,
) {
  void commands.mutate(() => props.onUpdate(groupId, { parentGroupId: null, beforeGroupId: null }));
}
