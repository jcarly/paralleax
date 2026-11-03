import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { getGroupInteractionIds, type Group, type UpdateGroupInput } from '@paralleax/shared';
import type { GroupTreeProjection } from './groupTree';
import type { GroupMoveDirection } from './groupTreeKeyboard';
import type { StoryGroupsPanelProps } from './storyGroupTypes';

export function useGroupTreeCommands(
  props: StoryGroupsPanelProps,
  tree: GroupTreeProjection,
  setExpandedIds: Dispatch<SetStateAction<ReadonlySet<string>>>,
  focusRow: (groupId?: string) => void,
) {
  const { t } = useTranslation();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mutate = useCallback(
    (action: () => Promise<unknown>) =>
      executeMutation({
        action,
        locked,
        readOnly: props.readOnly,
        setBusy,
        setMessage,
        translate: t,
      }),
    [props.readOnly, t],
  );
  const groupInteractionIds = useGroupInteractionIds(props);
  const moveGroup = useCallback(
    (group: Group, direction: GroupMoveDirection) => {
      const plan = getGroupMovePlan(tree, group, direction);
      const { input, expandGroupId } = plan;
      if (!input) {
        return;
      }
      if (expandGroupId) {
        setExpandedIds((current) => new Set([...current, expandGroupId]));
      }
      void mutate(() => props.onUpdate(group.id, input)).then(() => focusRow(group.id));
    },
    [focusRow, mutate, props, setExpandedIds, tree],
  );
  const expandGroup = useCallback(
    (groupId: string) => setExpandedIds((current) => new Set([...current, groupId])),
    [setExpandedIds],
  );
  return { busy, message, mutate, groupInteractionIds, moveGroup, expandGroup };
}

function useGroupInteractionIds(props: StoryGroupsPanelProps) {
  const liveInteractionIds = useMemo(
    () => new Set(props.story.interactions.map(({ id }) => id)),
    [props.story.interactions],
  );
  return useCallback(
    (groupId: string) =>
      getGroupInteractionIds(props.story.groups ?? [], groupId).filter((id) =>
        liveInteractionIds.has(id),
      ),
    [liveInteractionIds, props.story.groups],
  );
}

async function executeMutation({
  action,
  locked,
  readOnly,
  setBusy,
  setMessage,
  translate,
}: {
  action: () => Promise<unknown>;
  locked: { current: boolean };
  readOnly: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
  translate: ReturnType<typeof useTranslation>['t'];
}) {
  if (locked.current || readOnly) {
    return false;
  }
  locked.current = true;
  setBusy(true);
  setMessage('');
  try {
    const result = Boolean(await action());
    setMessage(translate(result ? 'editor.groups.saved' : 'editor.groups.failed'));
    return result;
  } catch {
    setMessage(translate('editor.groups.failed'));
    return false;
  } finally {
    locked.current = false;
    setBusy(false);
  }
}

function getGroupMovePlan(
  tree: GroupTreeProjection,
  group: Group,
  direction: GroupMoveDirection,
): { input?: UpdateGroupInput; expandGroupId?: string } {
  const siblings = tree.children.get(group.parentGroupId) ?? [];
  const index = siblings.findIndex(({ id }) => id === group.id);
  return getMovePlanByDirection[direction](tree, group, siblings, index);
}

const getMovePlanByDirection: Record<
  GroupMoveDirection,
  (
    tree: GroupTreeProjection,
    group: Group,
    siblings: readonly Group[],
    index: number,
  ) => { input?: UpdateGroupInput; expandGroupId?: string }
> = {
  up: (_tree, group, siblings, index) => getMoveUpPlan(group, siblings, index),
  down: (_tree, group, siblings, index) => getMoveDownPlan(group, siblings, index),
  in: (_tree, _group, siblings, index) => getMoveInPlan(siblings, index),
  out: (tree, group) => getMoveOutPlan(tree, group),
};

function getMoveUpPlan(group: Group, siblings: readonly Group[], index: number) {
  if (index <= 0) {
    return {};
  }
  return {
    input: {
      parentGroupId: group.parentGroupId ?? null,
      beforeGroupId: siblings[index - 1].id,
    },
  };
}

function getMoveDownPlan(group: Group, siblings: readonly Group[], index: number) {
  if (index >= siblings.length - 1) {
    return {};
  }
  return {
    input: {
      parentGroupId: group.parentGroupId ?? null,
      beforeGroupId: siblings[index + 2]?.id ?? null,
    },
  };
}

function getMoveInPlan(siblings: readonly Group[], index: number) {
  if (index <= 0) {
    return {};
  }
  const parentGroupId = siblings[index - 1].id;
  return { input: { parentGroupId, beforeGroupId: null }, expandGroupId: parentGroupId };
}

function getMoveOutPlan(tree: GroupTreeProjection, group: Group) {
  const parent = tree.byId.get(group.parentGroupId ?? '');
  if (!parent) {
    return {};
  }
  const uncles = tree.children.get(parent.parentGroupId) ?? [];
  const nextUncle = uncles[uncles.findIndex(({ id }) => id === parent.id) + 1];
  return {
    input: { parentGroupId: parent.parentGroupId ?? null, beforeGroupId: nextUncle?.id ?? null },
  };
}
