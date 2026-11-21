import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import {
  checkNativeStoryGroupsAndItemReachability,
  type NativeStoryContent,
  type Story,
} from '@paralleax/shared';
import { validateNativeStoryStructure } from '@paralleax/shared/native-story-validation';
import type { StoryGraphService } from '../application/story-graph';
import { assertStoryWithinQuotas, type StoryQuotas } from '../story-quotas';
import { validateNativeStoryDtoConstraints } from './native-story-dto-validation';
import { validateNativeStoryStats } from './native-story-stats-validation';
import { validateNativeStoryRichText } from './native-story-rich-text-validation';

export type NativeStoryCoreResult =
  | { status: 'core_valid'; story: NativeStoryContent }
  | { status: 'unsupported_version'; version: number }
  | { status: 'invalid'; code: string; path: string; message: string };

/** Validate a candidate before collision handling and final persistence checks. */
export function validateNativeStoryCore(
  value: unknown,
  graph: StoryGraphService,
  quotas?: StoryQuotas,
): NativeStoryCoreResult {
  const structure = validateNativeStoryStructure(value);
  if (structure.status === 'unsupported_version') {
    return structure;
  }
  if (structure.status === 'invalid') {
    return { ...structure, message: 'The Story file structure is invalid.' };
  }
  const content = structure.story;
  const story: Story = { ...content, id: 'native-preview', createdAt: '', updatedAt: '' };
  return validateContent(story, graph, quotas) ?? { status: 'core_valid', story: content };
}

function validateContent(
  story: Story,
  graph: StoryGraphService,
  quotas: StoryQuotas | undefined,
): NativeStoryCoreResult | undefined {
  const quotaIssue = validateQuota(story, quotas);
  if (quotaIssue) {
    return quotaIssue;
  }
  const dtoIssue = validateNativeStoryDtoConstraints(story);
  if (dtoIssue) {
    return { status: 'invalid', code: 'INVALID_CONTENT', ...dtoIssue };
  }
  const organizationIssue = checkNativeStoryGroupsAndItemReachability(story);
  if (organizationIssue) {
    return { status: 'invalid', ...organizationIssue };
  }
  if ((story.characters ?? []).filter(({ isPlayable }) => isPlayable === true).length > 1) {
    return {
      status: 'invalid',
      code: 'INVALID_CONTENT',
      path: '$.story.characters',
      message: 'Only one character can be playable.',
    };
  }
  const statIssue = validateNativeStoryStats(story);
  if (statIssue) {
    return { status: 'invalid', code: 'INVALID_STATS', ...statIssue };
  }
  const graphIssue = validateGraph(story, graph);
  if (graphIssue) {
    return graphIssue;
  }
  const richTextIssue = validateNativeStoryRichText(story);
  if (richTextIssue) {
    return { status: 'invalid', ...richTextIssue };
  }
  return undefined;
}

function validateQuota(
  story: Story,
  quotas: StoryQuotas | undefined,
): NativeStoryCoreResult | undefined {
  try {
    assertStoryWithinQuotas(story, undefined, quotas);
    return undefined;
  } catch (error) {
    if (!(error instanceof UnprocessableEntityException)) {
      throw error;
    }
    return {
      status: 'invalid',
      code: 'STORY_QUOTA_EXCEEDED',
      path: '$.story',
      message: 'The Story exceeds its allowed size or entity count.',
    };
  }
}

function validateGraph(story: Story, graph: StoryGraphService): NativeStoryCoreResult | undefined {
  for (const [index, interaction] of story.interactions.entries()) {
    const path = `$.story.interactions[${index}]`;
    try {
      const issue = graph.validateNativeInteractionRelations(story, interaction);
      if (issue !== undefined) {
        return { status: 'invalid', code: 'INVALID_GRAPH', path, message: issue };
      }
    } catch (error) {
      if (!(error instanceof HttpException)) {
        throw error;
      }
      return { status: 'invalid', code: 'INVALID_GRAPH', path, message: error.message };
    }
  }
  return undefined;
}
