import {
  getStatTargets,
  groupItemInstancesByParent,
  type ItemInstance,
  type StatTarget,
  type Story,
} from '@paralleax/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { statTargetPathLabel } from '../storyStats';

interface VariableBranch {
  id: string;
  kind: 'branch';
  name: string;
  label: string;
  children: VariablePickerNode[];
}

interface VariableLeaf {
  id: string;
  kind: 'variable';
  name: string;
  label: string;
  displayLabel: string;
  reference: string;
  target: StatTarget;
}

type VariablePickerNode = VariableBranch | VariableLeaf;

export interface RichTextVariableSelection {
  target: StatTarget;
  reference: string;
  label: string;
}

export function RichTextVariablePicker({
  story,
  selectedTarget,
  onSelect,
  onSelectionClear,
  autoFocus = false,
}: {
  story: Story;
  selectedTarget?: StatTarget;
  onSelect: (selection: RichTextVariableSelection) => void;
  onSelectionClear?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const roots = useMemo(
    () =>
      buildVariableTree(story, {
        character: (name) => t('richText.characterVariableOwner', { name }),
        item: (name) => t('richText.itemVariableOwner', { name }),
        location: (name) => t('richText.locationVariableOwner', { name }),
        story: (name) => t('richText.storyVariableOwner', { name }),
        storyPath: t('attributes.owner.story'),
        variable: (name) => t('richText.variableOption', { name }),
      }),
    [story, t],
  );
  const [selectedPath, setSelectedPath] = useState<string[]>(
    () => findVariablePath(roots, selectedTarget) ?? [],
  );
  const levels = getVisibleLevels(roots, selectedPath);

  return (
    <div
      aria-label={t('richText.variablePicker')}
      className="rich-text-variable-picker"
      role="group"
    >
      {levels.map(({ nodes, parent }, depth) => {
        const selectedId = selectedPath[depth] ?? '';
        const label = parent
          ? t('richText.variableOrItemFor', { name: parent.name })
          : t('richText.variableOwner');
        return (
          <label className="rich-text-variable-field" key={parent?.id ?? 'owner'}>
            {label}
            <select
              aria-label={label}
              autoFocus={autoFocus && depth === 0}
              value={selectedId}
              onChange={(event) => {
                const selected = nodes.find(({ id }) => id === event.target.value);
                if (!selected) return;
                if (selected.kind === 'variable') {
                  setSelectedPath([...selectedPath.slice(0, depth), selected.id]);
                  onSelect({
                    target: selected.target,
                    reference: selected.reference,
                    label: selected.displayLabel,
                  });
                  return;
                }
                setSelectedPath([...selectedPath.slice(0, depth), selected.id]);
                onSelectionClear?.();
              }}
            >
              <option value="" disabled>
                {parent ? t('richText.chooseVariableOrItem') : t('richText.chooseVariableOwner')}
              </option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

interface VariableTreeLabels {
  story: (name: string) => string;
  storyPath: string;
  character: (name: string) => string;
  location: (name: string) => string;
  item: (name: string) => string;
  variable: (name: string) => string;
}

function buildVariableTree(story: Story, labels: VariableTreeLabels): VariableBranch[] {
  const targets = getStatTargets(story);
  const itemDefinitions = new Map(
    (story.itemDefinitions ?? []).map((definition) => [definition.id, definition]),
  );

  const createVariableLeaf = (target: StatTarget, referenceParts: string[]): VariableLeaf => {
    const name = target.definition?.name ?? target.assignment.statDefinitionId;
    return {
      id: `variable:${target.itemId ?? target.ownerType}:${target.assignment.id}`,
      kind: 'variable',
      name,
      label: labels.variable(name),
      displayLabel: statTargetPathLabel(target, labels.storyPath),
      reference: [...referenceParts, name].join('.'),
      target,
    };
  };

  const createOwnerBranch = (
    kind: 'character' | 'location',
    owner: NonNullable<Story['characters']>[number] | NonNullable<Story['locations']>[number],
  ): VariableBranch | undefined => {
    const directVariables = targets
      .filter((target) => target.ownerType === kind && target.ownerId === owner.id)
      .map((target) => createVariableLeaf(target, [owner.name]));
    const items = owner.items ?? [];
    const itemIds = new Set(items.map(({ id }) => id));
    const childrenByParent = groupItemInstancesByParent(items);
    const itemBranches = items
      .filter(({ parentItemId }) => !parentItemId || !itemIds.has(parentItemId))
      .map((item) =>
        createItemBranch(
          item,
          items,
          childrenByParent,
          itemDefinitions,
          targets,
          labels,
          new Set(),
        ),
      )
      .filter((branch): branch is VariableBranch => Boolean(branch));
    const children = [...directVariables, ...itemBranches];
    if (children.length === 0) return undefined;
    return {
      id: `owner:${kind}:${owner.id}`,
      kind: 'branch',
      name: owner.name,
      label: labels[kind](owner.name),
      children,
    };
  };

  const storyVariables = targets
    .filter(({ ownerType }) => ownerType === 'story')
    .map((target) => createVariableLeaf(target, ['story']));
  const storyBranch: VariableBranch | undefined =
    storyVariables.length > 0
      ? {
          id: `owner:story:${story.id}`,
          kind: 'branch',
          name: story.title,
          label: labels.story(story.title),
          children: storyVariables,
        }
      : undefined;

  return [
    ...(storyBranch ? [storyBranch] : []),
    ...(story.characters ?? []).flatMap((character) => {
      const branch = createOwnerBranch('character', character);
      return branch ? [branch] : [];
    }),
    ...(story.locations ?? []).flatMap((location) => {
      const branch = createOwnerBranch('location', location);
      return branch ? [branch] : [];
    }),
  ];
}

function createItemBranch(
  item: ItemInstance,
  ownerItems: ItemInstance[],
  childrenByParent: Map<string, ItemInstance[]>,
  itemDefinitions: Map<string, NonNullable<Story['itemDefinitions']>[number]>,
  targets: StatTarget[],
  labels: VariableTreeLabels,
  ancestors: ReadonlySet<string>,
): VariableBranch | undefined {
  if (ancestors.has(item.id)) return undefined;
  const definition = itemDefinitions.get(item.itemDefinitionId);
  const sameDefinitionItems = ownerItems.filter(
    ({ itemDefinitionId }) => itemDefinitionId === item.itemDefinitionId,
  );
  const copyNumber =
    sameDefinitionItems.length > 1
      ? ` #${sameDefinitionItems.findIndex(({ id }) => id === item.id) + 1}`
      : '';
  const name = `${definition?.name ?? item.itemDefinitionId}${copyNumber}`;
  const variables = targets
    .filter((target) => target.itemId === item.id)
    .map((target) => {
      const variableName = target.definition?.name ?? target.assignment.statDefinitionId;
      return {
        id: `variable:${item.id}:${target.assignment.id}`,
        kind: 'variable' as const,
        name: variableName,
        label: labels.variable(variableName),
        displayLabel: statTargetPathLabel(target, labels.storyPath),
        reference: `${item.id}.${variableName}`,
        target,
      };
    });
  const nextAncestors = new Set([...ancestors, item.id]);
  const nestedItems = (childrenByParent.get(item.id) ?? [])
    .map((child) =>
      createItemBranch(
        child,
        ownerItems,
        childrenByParent,
        itemDefinitions,
        targets,
        labels,
        nextAncestors,
      ),
    )
    .filter((branch): branch is VariableBranch => Boolean(branch));
  const children = [...variables, ...nestedItems];
  if (children.length === 0) return undefined;
  return {
    id: `item:${item.id}`,
    kind: 'branch',
    name,
    label: labels.item(name),
    children,
  };
}

function getVisibleLevels(
  roots: VariableBranch[],
  selectedPath: string[],
): Array<{ nodes: VariablePickerNode[]; parent?: VariableBranch }> {
  const levels: Array<{ nodes: VariablePickerNode[]; parent?: VariableBranch }> = [];
  let nodes: VariablePickerNode[] = roots;
  let parent: VariableBranch | undefined;
  for (let depth = 0; nodes.length > 0; depth += 1) {
    levels.push({ nodes, parent });
    const selected = nodes.find(({ id }) => id === selectedPath[depth]);
    if (!selected || selected.kind === 'variable') break;
    parent = selected;
    nodes = selected.children;
  }
  return levels;
}

function findVariablePath(
  nodes: VariablePickerNode[],
  selectedTarget?: StatTarget,
): string[] | undefined {
  if (!selectedTarget) return undefined;
  for (const node of nodes) {
    if (node.kind === 'variable') {
      if (
        node.target.assignment.id === selectedTarget.assignment.id &&
        node.target.itemId === selectedTarget.itemId
      ) {
        return [node.id];
      }
      continue;
    }
    const childPath = findVariablePath(node.children, selectedTarget);
    if (childPath) return [node.id, ...childPath];
  }
  return undefined;
}
