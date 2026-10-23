import { expressionReferencesAny } from '../expressions/index.js';
import type { TriggerCondition } from '../triggers/conditions.js';
import type { Interaction } from '../model/interactions.js';

export function removeStatConditionsReferencing(
  conditions: readonly TriggerCondition[],
  assignmentIds: ReadonlySet<string>,
  itemIds: ReadonlySet<string> = new Set(),
): TriggerCondition[] {
  return conditions.filter((condition) => {
    if (!('statId' in condition)) return true;
    return (
      !assignmentIds.has(condition.statId) &&
      !(condition.itemId && itemIds.has(condition.itemId)) &&
      !(
        'comparisonStatId' in condition &&
        condition.comparisonStatId !== undefined &&
        assignmentIds.has(condition.comparisonStatId)
      ) &&
      !(
        'comparisonItemId' in condition &&
        condition.comparisonItemId !== undefined &&
        itemIds.has(condition.comparisonItemId)
      ) &&
      !expressionReferencesAny(condition.expression, assignmentIds, itemIds)
    );
  });
}

export function cleanStatConditionalTextReferences(
  interaction: Interaction,
  assignmentIds: ReadonlySet<string>,
  itemIds: ReadonlySet<string> = new Set(),
): Pick<Interaction, 'body' | 'conditionalTextBlocks'> {
  const removed = new Set<string>();
  const conditionalTextBlocks = interaction.conditionalTextBlocks?.flatMap((block) => {
    const conditions = removeStatConditionsReferencing(block.conditions, assignmentIds, itemIds);
    if (conditions.length) return [{ ...block, conditions }];
    removed.add(
      block.id
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;'),
    );
    return [];
  });
  // Bodies are canonical sanitized HTML: remove the semantic frame marker,
  // retaining the frame's nested markup and authored content.
  const body = removed.size
    ? interaction.body.replace(/<(?:div|span)\b[^>]*>/gi, (tag) =>
        tag.replace(/\sdata-conditional-text-block="([^"]*)"/g, (attribute, id: string) =>
          removed.has(id) ? '' : attribute,
        ),
      )
    : interaction.body;
  return { body, conditionalTextBlocks };
}
