import { getStatValueType, type StatTarget } from '@paralleax/shared';

export {
  getStatAssignmentOwners,
  getStatTargets,
  type StatAssignmentOwner,
  type StatOwnerType,
  type StatTarget,
} from '@paralleax/shared';

export function statTargetValueType(target: StatTarget) {
  return target.definition ? getStatValueType(target.definition) : 'number';
}

export function statTargetId(target: StatTarget) {
  return `${target.itemId ?? ''}:${target.assignment.id}`;
}

export function statTargetLabel(
  target: StatTarget,
  storyLabel: string,
  {
    separator = ' → ',
    includeItemPath = false,
  }: { separator?: string; includeItemPath?: boolean } = {},
) {
  const statName = target.definition?.name ?? target.assignment.statDefinitionId;
  if (target.itemId) {
    return itemStatTargetLabel(target, statName, separator, includeItemPath);
  }
  return [target.ownerName ?? storyLabel, statName].join(separator);
}

function itemStatTargetLabel(
  target: StatTarget,
  statName: string,
  separator: string,
  includeItemPath: boolean,
) {
  return [
    target.instanceOwnerName ?? target.itemId,
    ...statItemPath(target, includeItemPath),
    statName,
  ].join(separator);
}

function statItemPath(target: StatTarget, includeItemPath: boolean): string[] {
  if (includeItemPath && target.itemPathNames) {
    return target.itemPathNames;
  }
  return [statItemName(target)];
}

function statItemName(target: StatTarget): string {
  const itemName = target.itemName ?? target.ownerName ?? target.itemId;
  return `${itemName}${target.itemCopyNumber ?? ''}`;
}

export function statTargetPathLabel(target: StatTarget, storyLabel: string) {
  return statTargetLabel(target, storyLabel, { separator: ' → ', includeItemPath: true });
}
