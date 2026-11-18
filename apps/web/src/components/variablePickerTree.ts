import {
  getStatTargets,
  groupItemInstancesByParent,
  type ItemInstance,
  type StatTarget,
  type Story,
} from '@paralleax/shared';
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

export type VariablePickerNode = VariableBranch | VariableLeaf;
export type VariablePickerLevel = { nodes: VariablePickerNode[]; parent?: VariableBranch };

interface VariableTreeLabels {
  story: (name: string) => string;
  storyPath: string;
  character: (name: string) => string;
  location: (name: string) => string;
  item: (name: string) => string;
  variable: (name: string) => string;
}

type Owner = NonNullable<Story['characters']>[number] | NonNullable<Story['locations']>[number];
type OwnerBranchOptions = {
  kind: 'character' | 'location';
  owner: Owner;
  targets: StatTarget[];
  itemDefinitions: Map<string, NonNullable<Story['itemDefinitions']>[number]>;
  labels: VariableTreeLabels;
};

interface ItemBranchOptions {
  item: ItemInstance;
  ownerItems: ItemInstance[];
  childrenByParent: Map<string, ItemInstance[]>;
  itemDefinitions: Map<string, NonNullable<Story['itemDefinitions']>[number]>;
  targets: StatTarget[];
  labels: VariableTreeLabels;
  ancestors: ReadonlySet<string>;
}

export function buildVariableTree(
  story: Story,
  labels: VariableTreeLabels,
  filter?: (target: StatTarget) => boolean,
): VariableBranch[] {
  const targets = getStatTargets(story).filter((target) => !filter || filter(target));
  const itemDefinitions = new Map(
    (story.itemDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  const storyVariables = targets
    .filter(({ ownerType }) => ownerType === 'story')
    .map((target) => createVariableLeaf(target, ['story'], labels));
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
  const characterBranches = (story.characters ?? []).flatMap((character) => {
    const branch = createOwnerBranch({
      kind: 'character',
      owner: character,
      targets,
      itemDefinitions,
      labels,
    });
    return branch ? [branch] : [];
  });
  const locationBranches = (story.locations ?? []).flatMap((location) => {
    const branch = createOwnerBranch({
      kind: 'location',
      owner: location,
      targets,
      itemDefinitions,
      labels,
    });
    return branch ? [branch] : [];
  });
  return [...(storyBranch ? [storyBranch] : []), ...characterBranches, ...locationBranches];
}

function createVariableLeaf(
  target: StatTarget,
  referenceParts: string[],
  labels: VariableTreeLabels,
): VariableLeaf {
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
}

function createOwnerBranch({ kind, owner, targets, itemDefinitions, labels }: OwnerBranchOptions) {
  const directVariables = targets
    .filter((target) => target.ownerType === kind && target.ownerId === owner.id)
    .map((target) => createVariableLeaf(target, [owner.name], labels));
  const items = owner.items ?? [];
  const itemIds = new Set(items.map(({ id }) => id));
  const childrenByParent = groupItemInstancesByParent(items);
  const itemBranches = items
    .filter(
      ({ parentItemId }) =>
        parentItemId === undefined || parentItemId.length === 0 || !itemIds.has(parentItemId),
    )
    .map((item) =>
      createItemBranch({
        item,
        ownerItems: items,
        childrenByParent,
        itemDefinitions,
        targets,
        labels,
        ancestors: new Set(),
      }),
    )
    .filter((branch): branch is VariableBranch => Boolean(branch));
  const children = [...directVariables, ...itemBranches];
  if (children.length === 0) {
    return undefined;
  }
  return {
    id: `owner:${kind}:${owner.id}`,
    kind: 'branch' as const,
    name: owner.name,
    label: labels[kind](owner.name),
    children,
  };
}

function createItemBranch(options: ItemBranchOptions): VariableBranch | undefined {
  const { item, ownerItems, childrenByParent, itemDefinitions, targets, labels, ancestors } =
    options;
  if (ancestors.has(item.id)) {
    return undefined;
  }
  const definition = itemDefinitions.get(item.itemDefinitionId);
  const sameDefinitionItems = ownerItems.filter(
    ({ itemDefinitionId }) => itemDefinitionId === item.itemDefinitionId,
  );
  const copyNumber =
    sameDefinitionItems.length > 1
      ? ` #${sameDefinitionItems.findIndex(({ id }) => id === item.id) + 1}`
      : '';
  const name = `${definition?.name ?? item.itemDefinitionId}${copyNumber}`;
  const variables = createItemVariableLeaves(item, targets, labels);
  const nextAncestors = new Set([...ancestors, item.id]);
  const nestedItems = (childrenByParent.get(item.id) ?? [])
    .map((child) => createItemBranch({ ...options, item: child, ancestors: nextAncestors }))
    .filter((branch): branch is VariableBranch => Boolean(branch));
  const children = [...variables, ...nestedItems];
  if (children.length === 0) {
    return undefined;
  }
  return { id: `item:${item.id}`, kind: 'branch', name, label: labels.item(name), children };
}

function createItemVariableLeaves(
  item: ItemInstance,
  targets: StatTarget[],
  labels: VariableTreeLabels,
): VariableLeaf[] {
  return targets
    .filter((target) => target.itemId === item.id)
    .map((target) => {
      const name = target.definition?.name ?? target.assignment.statDefinitionId;
      return {
        id: `variable:${item.id}:${target.assignment.id}`,
        kind: 'variable',
        name,
        label: labels.variable(name),
        displayLabel: statTargetPathLabel(target, labels.storyPath),
        reference: `${item.id}.${name}`,
        target,
      };
    });
}

export function getVisibleLevels(
  roots: VariableBranch[],
  selectedPath: string[],
): VariablePickerLevel[] {
  const levels: VariablePickerLevel[] = [];
  let nodes: VariablePickerNode[] = roots;
  let parent: VariableBranch | undefined;
  for (let depth = 0; nodes.length > 0; depth += 1) {
    levels.push({ nodes, parent });
    const selected = nodes.find(({ id }) => id === selectedPath[depth]);
    if (!selected || selected.kind === 'variable') {
      break;
    }
    parent = selected;
    nodes = selected.children;
  }
  return levels;
}

export function findVariablePath(
  nodes: VariablePickerNode[],
  selectedTarget?: StatTarget,
): string[] | undefined {
  if (!selectedTarget) {
    return undefined;
  }
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
    if (childPath) {
      return [node.id, ...childPath];
    }
  }
  return undefined;
}
