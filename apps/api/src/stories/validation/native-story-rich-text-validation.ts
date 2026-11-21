import {
  getStatAssignmentOwners,
  getStoryItemEntries,
  statItemTargetIssue,
  type Story,
  type StatAssignmentOwner,
} from '@paralleax/shared';
import { inspectNativeStoryRichText, type NativeRichTextReference } from '../rich-text';

export interface NativeStoryRichTextIssue {
  code: 'UNSUPPORTED_CONTENT' | 'MISSING_REFERENCE';
  path: string;
  message: string;
}

type ReferenceIndex = {
  interactions: ReadonlySet<string>;
  assignments: ReadonlyMap<string, StatAssignmentOwner>;
  items: ReadonlyMap<string, string>;
};

/** Validate already-sanitized markup and its structured references without changing it. */
export function validateNativeStoryRichText(story: Story): NativeStoryRichTextIssue | undefined {
  const index = createReferenceIndex(story);
  for (const [position, interaction] of story.interactions.entries()) {
    const path = `$.story.interactions[${position}].body`;
    const { supported, references } = inspectNativeStoryRichText(interaction.body);
    if (!supported) {
      return {
        code: 'UNSUPPORTED_CONTENT',
        path,
        message: 'Rich text contains unsupported or unsafe markup.',
      };
    }
    const blocks = new Set((interaction.conditionalTextBlocks ?? []).map(({ id }) => id));
    for (const reference of references) {
      if (!referenceExists(reference, blocks, index)) {
        return {
          code: 'MISSING_REFERENCE',
          path,
          message: 'Rich text references an unavailable Story element.',
        };
      }
    }
  }
  return undefined;
}

function createReferenceIndex(story: Story): ReferenceIndex {
  const assignments = new Map<string, StatAssignmentOwner>();
  for (const owner of getStatAssignmentOwners(story)) {
    for (const assignment of owner.assignments) {
      assignments.set(assignment.id, owner);
    }
  }
  return {
    interactions: new Set(story.interactions.map(({ id }) => id)),
    assignments,
    items: new Map(getStoryItemEntries(story).map(({ item }) => [item.id, item.itemDefinitionId])),
  };
}

function referenceExists(
  reference: NativeRichTextReference,
  blocks: ReadonlySet<string>,
  index: ReferenceIndex,
): boolean {
  switch (reference.kind) {
    case 'interaction':
      return index.interactions.has(reference.id);
    case 'block':
      return blocks.has(reference.id);
    case 'orphanItem':
      return false;
    case 'stat': {
      const owner = index.assignments.get(reference.id);
      if (owner === undefined) {
        return false;
      }
      return (
        statItemTargetIssue({
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          itemId: reference.itemId,
          itemDefinitionId:
            reference.itemId === undefined ? undefined : index.items.get(reference.itemId),
        }) === undefined
      );
    }
  }
}
