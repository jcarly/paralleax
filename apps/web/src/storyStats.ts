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
    separator = ' — ',
    includeItemPath = false,
  }: { separator?: string; includeItemPath?: boolean } = {},
) {
  const statName = target.definition?.name ?? target.assignment.statDefinitionId;
  if (target.itemId) {
    const itemNames = includeItemPath
      ? (target.itemPathNames ?? [
          `${target.itemName ?? target.ownerName ?? target.itemId}${target.itemCopyNumber ?? ''}`,
        ])
      : [`${target.itemName ?? target.ownerName ?? target.itemId}${target.itemCopyNumber ?? ''}`];
    return [target.instanceOwnerName ?? target.itemId, ...itemNames, statName].join(separator);
  }
  return [target.ownerName ?? storyLabel, statName].join(separator);
}

export function statTargetPathLabel(target: StatTarget, storyLabel: string) {
  return statTargetLabel(target, storyLabel, { separator: ' → ', includeItemPath: true });
}
