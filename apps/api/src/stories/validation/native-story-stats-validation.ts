import { HttpException } from '@nestjs/common';
import { type StatAssignment, type Story } from '@paralleax/shared';
import {
  createStatAssignment,
  createStatDefinition,
  type StatOwnerType,
} from '../application/story-stats';
import type { NativeStoryDtoIssue } from './native-story-dto-validation';

type StatOwner = {
  ownerType: StatOwnerType;
  ownerId?: string;
  assignments: readonly StatAssignment[];
  path: string;
};

/** Validate definitions and owner assignments using the editor's stat operations. */
export function validateNativeStoryStats(story: Story): NativeStoryDtoIssue | undefined {
  const target = emptyStatStory(story);
  for (const [index, definition] of (story.statDefinitions ?? []).entries()) {
    const issue = captureIssue(`$.story.statDefinitions[${index}]`, () => {
      createStatDefinition(target, definition.id, {
        ...definition,
        valueType: definition.valueType ?? 'number',
      });
    });
    if (issue !== undefined) {
      return issue;
    }
  }
  for (const owner of statOwners(story)) {
    for (const [index, assignment] of owner.assignments.entries()) {
      const issue = captureIssue(`${owner.path}[${index}]`, () => {
        createStatAssignment(target, assignment.id, {
          statDefinitionId: assignment.statDefinitionId,
          initialValue: assignment.initialValue,
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
        });
      });
      if (issue !== undefined) {
        return issue;
      }
    }
  }
  return undefined;
}

function emptyStatStory(story: Story): Story {
  return {
    ...story,
    statDefinitions: [],
    stats: [],
    characters: story.characters?.map((owner) => ({ ...owner, stats: [] })),
    locations: story.locations?.map((owner) => ({ ...owner, stats: [] })),
    itemDefinitions: story.itemDefinitions?.map((owner) => ({ ...owner, stats: [] })),
  };
}

function statOwners(story: Story): StatOwner[] {
  return [
    { ownerType: 'story', assignments: story.stats ?? [], path: '$.story.stats' },
    ...(story.characters ?? []).map((owner, index) => ({
      ownerType: 'character' as const,
      ownerId: owner.id,
      assignments: owner.stats ?? [],
      path: `$.story.characters[${index}].stats`,
    })),
    ...(story.locations ?? []).map((owner, index) => ({
      ownerType: 'location' as const,
      ownerId: owner.id,
      assignments: owner.stats ?? [],
      path: `$.story.locations[${index}].stats`,
    })),
    ...(story.itemDefinitions ?? []).map((owner, index) => ({
      ownerType: 'itemDefinition' as const,
      ownerId: owner.id,
      assignments: owner.stats ?? [],
      path: `$.story.itemDefinitions[${index}].stats`,
    })),
  ];
}

function captureIssue(path: string, operation: () => void): NativeStoryDtoIssue | undefined {
  try {
    operation();
    return undefined;
  } catch (error) {
    if (!(error instanceof HttpException)) {
      throw error;
    }
    return { path, message: error.message };
  }
}
