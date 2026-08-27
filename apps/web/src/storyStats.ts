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

export function statTargetLabel(target: StatTarget, storyLabel: string) {
  const statName = target.definition?.name ?? target.assignment.statDefinitionId;
  if (target.itemId) {
    return `${target.instanceOwnerName ?? target.itemId} — ${target.itemName ?? target.ownerName ?? target.itemId}${target.itemCopyNumber ?? ''} — ${statName}`;
  }
  return `${target.ownerName ?? storyLabel} — ${statName}`;
}
