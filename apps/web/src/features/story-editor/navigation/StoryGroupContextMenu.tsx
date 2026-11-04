import { useTranslation } from 'react-i18next';
import type { Group } from '@paralleax/shared';
import { ContextMenu, ContextMenuAction } from '../../../components/ContextMenu';
import type { GroupMoveDirection } from './groupTreeKeyboard';
import type { StoryGroupsPanelProps } from './storyGroupTypes';

interface StoryGroupContextMenuProps {
  menu?: GroupTreeMenu;
  group?: Group;
  siblingGroups: readonly Group[];
  interactionIds: string[];
  props: StoryGroupsPanelProps;
  onClose: () => void;
  onRename: (groupId: string) => void;
  onCreateChild: (groupId: string) => void;
  onAddSelection: (group: Group) => void;
  onRemoveSelection: (group: Group) => void;
  onSelectInteractions: (interactionIds: string[]) => void;
  onFocus: (interactionIds: string[]) => void;
  onMove: (group: Group, direction: GroupMoveDirection) => void;
  onMoveToRoot: (groupId: string) => void;
  onDelete: (groupId: string) => void;
}

export interface GroupTreeMenu {
  groupId: string;
  position: { x: number; y: number };
}

export function StoryGroupContextMenu(menuProps: StoryGroupContextMenuProps) {
  const { t } = useTranslation();
  const { group, menu } = menuProps;
  if (!menu || !group) {
    return null;
  }
  return (
    <ContextMenu
      scrollable
      position={menu.position}
      label={t('editor.groups.actions', { title: group.title })}
      onClose={menuProps.onClose}
    >
      {!menuProps.props.readOnly ? <GroupEditActions {...menuProps} group={group} /> : null}
      {menuProps.interactionIds.length ? (
        <GroupSelectionActions {...menuProps} interactionIds={menuProps.interactionIds} />
      ) : null}
      {!menuProps.props.readOnly ? <GroupStructureActions {...menuProps} group={group} /> : null}
    </ContextMenu>
  );
}

function GroupEditActions({
  group,
  props,
  onClose,
  onRename,
  onCreateChild,
  onAddSelection,
  onRemoveSelection,
}: StoryGroupContextMenuProps & { group: Group }) {
  const { t } = useTranslation();
  const canAdd = props.selectionIds.some((id) => !group.interactionIds.includes(id));
  const canRemove = props.selectionIds.some((id) => group.interactionIds.includes(id));
  return (
    <>
      <MenuAction
        label={t('editor.groups.rename')}
        onClose={onClose}
        onClick={() => onRename(group.id)}
      />
      <MenuAction
        label={t('editor.groups.createChild')}
        onClose={onClose}
        onClick={() => onCreateChild(group.id)}
      />
      {canAdd ? (
        <MenuAction
          label={t('editor.groups.addSelection')}
          onClose={onClose}
          onClick={() => onAddSelection(group)}
        />
      ) : null}
      {canRemove ? (
        <MenuAction
          label={t('editor.groups.removeSelection')}
          onClose={onClose}
          onClick={() => onRemoveSelection(group)}
        />
      ) : null}
    </>
  );
}

function GroupSelectionActions({
  interactionIds,
  onClose,
  onSelectInteractions,
  onFocus,
}: StoryGroupContextMenuProps & { interactionIds: string[] }) {
  const { t } = useTranslation();
  return (
    <>
      <MenuAction
        label={t('editor.groups.selectInteractions')}
        onClose={onClose}
        onClick={() => onSelectInteractions(interactionIds)}
      />
      <MenuAction
        label={t('editor.groups.focus')}
        onClose={onClose}
        onClick={() => onFocus(interactionIds)}
      />
    </>
  );
}

function GroupStructureActions({
  group,
  siblingGroups,
  onClose,
  onMove,
  onMoveToRoot,
  onDelete,
}: StoryGroupContextMenuProps & { group: Group }) {
  const { t } = useTranslation();
  return (
    <>
      <GroupSiblingActions
        group={group}
        siblingGroups={siblingGroups}
        onClose={onClose}
        onMove={onMove}
      />
      <GroupParentActions
        group={group}
        onClose={onClose}
        onMove={onMove}
        onMoveToRoot={onMoveToRoot}
      />
      <ContextMenuAction
        label={t('editor.groups.delete')}
        danger
        onClick={() => {
          onClose();
          onDelete(group.id);
        }}
      />
    </>
  );
}

function GroupSiblingActions({
  group,
  siblingGroups,
  onClose,
  onMove,
}: Pick<StoryGroupContextMenuProps, 'onClose' | 'onMove'> & {
  group: Group;
  siblingGroups: readonly Group[];
}) {
  const { t } = useTranslation();
  const index = siblingGroups.findIndex(({ id }) => id === group.id);
  const canMoveUp = index > 0;
  const canMoveDown = index < siblingGroups.length - 1;
  return (
    <>
      {canMoveUp ? (
        <>
          <MenuAction
            label={t('editor.groups.moveUp')}
            onClose={onClose}
            onClick={() => onMove(group, 'up')}
          />
          <MenuAction
            label={t('editor.groups.moveIn')}
            onClose={onClose}
            onClick={() => onMove(group, 'in')}
          />
        </>
      ) : null}
      {canMoveDown ? (
        <MenuAction
          label={t('editor.groups.moveDown')}
          onClose={onClose}
          onClick={() => onMove(group, 'down')}
        />
      ) : null}
    </>
  );
}

function GroupParentActions({
  group,
  onClose,
  onMove,
  onMoveToRoot,
}: Pick<StoryGroupContextMenuProps, 'onClose' | 'onMove' | 'onMoveToRoot'> & { group: Group }) {
  const { t } = useTranslation();
  if (!group.parentGroupId) {
    return null;
  }
  return (
    <>
      <MenuAction
        label={t('editor.groups.moveOut')}
        onClose={onClose}
        onClick={() => onMove(group, 'out')}
      />
      <MenuAction
        label={t('editor.groups.moveToRoot')}
        onClose={onClose}
        onClick={() => onMoveToRoot(group.id)}
      />
    </>
  );
}

function MenuAction({
  label,
  onClose,
  onClick,
}: {
  label: string;
  onClose: () => void;
  onClick: () => void;
}) {
  return (
    <ContextMenuAction
      label={label}
      onClick={() => {
        onClose();
        onClick();
      }}
    />
  );
}
