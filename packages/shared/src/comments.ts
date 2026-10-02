import type { Story } from './model/stories.js';
import type { StoryAccessCapabilities } from './access-control.js';
import type { UserDisplayIdentity } from './user-identity.js';

export const MAX_COMMENT_BODY_LENGTH = 4_000;
export const MAX_COMMENT_QUOTE_LENGTH = 1_000;

export type CommentTargetType =
  'interaction' | 'trigger' | 'character' | 'location' | 'itemDefinition' | 'statDefinition';

export type CommentTextField = 'title' | 'name' | 'body' | 'description';

/**
 * Stable, non-text inspector slots. These are collaboration metadata, not
 * authored Story fields: a slot identifies a meaningful control or section
 * without making transient buttons or dynamic rows commentable.
 */
export const commentTargetSlots = {
  interaction: {
    fields: ['location', 'characters', 'duration'] as const,
    sections: ['contextAndTiming', 'effects'] as const,
  },
  trigger: {
    fields: ['appearanceProbability', 'timer'] as const,
    sections: ['conditions'] as const,
  },
  character: {
    fields: ['category', 'imageUrl', 'isPlayable'] as const,
    sections: ['stats', 'items'] as const,
  },
  location: {
    fields: ['category', 'imageUrl'] as const,
    sections: ['items'] as const,
  },
  itemDefinition: {
    fields: ['category', 'imageUrl'] as const,
    sections: ['stats'] as const,
  },
  statDefinition: {
    fields: ['category', 'imageUrl', 'valueType', 'changePerHour'] as const,
    sections: ['assignments'] as const,
  },
} as const;

export type CommentEntityField = {
  [TargetType in CommentTargetType]: (typeof commentTargetSlots)[TargetType]['fields'][number];
}[CommentTargetType];

export type CommentEntitySection = {
  [TargetType in CommentTargetType]: (typeof commentTargetSlots)[TargetType]['sections'][number];
}[CommentTargetType];

export type CommentSemanticSlot =
  { kind: 'field'; field: CommentEntityField } | { kind: 'section'; section: CommentEntitySection };

export type CommentFieldAnchor = {
  [TargetType in CommentTargetType]: {
    kind: 'field';
    targetType: TargetType;
    targetId: string;
    field: (typeof commentTargetSlots)[TargetType]['fields'][number];
  };
}[CommentTargetType];

export type CommentSectionAnchor = {
  [TargetType in CommentTargetType]: {
    kind: 'section';
    targetType: TargetType;
    targetId: string;
    section: (typeof commentTargetSlots)[TargetType]['sections'][number];
  };
}[CommentTargetType];

export type CommentSemanticAnchor = CommentFieldAnchor | CommentSectionAnchor;

export interface CommentTextSelector {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  sourceHash: string;
}

export type CommentAnchor =
  | { kind: 'canvas'; position: { x: number; y: number } }
  | { kind: 'entity'; targetType: CommentTargetType; targetId: string }
  | CommentSemanticAnchor
  | {
      kind: 'text';
      targetType: CommentTargetType;
      targetId: string;
      field: CommentTextField;
      selector: CommentTextSelector;
    };

export type CommentAuthor = UserDisplayIdentity;

export interface CommentMessage {
  id: string;
  threadId: string;
  author: CommentAuthor;
  body: string;
  createdAt: string;
  editedAt?: string;
}

export interface StoryCommentThread {
  id: string;
  storyId: string;
  anchor: CommentAnchor;
  anchorLabel: string;
  status: 'open' | 'resolved';
  createdBy: CommentAuthor;
  createdAt: string;
  updatedAt: string;
  resolvedBy?: CommentAuthor;
  resolvedAt?: string;
  deletedBy?: CommentAuthor;
  deletedAt?: string;
  messages: CommentMessage[];
  detached?: boolean;
}

export function canManageCommentThread(
  capabilities: Pick<StoryAccessCapabilities, 'canManage' | 'canEdit'> | undefined,
  actorId: string | undefined,
  thread: Pick<StoryCommentThread, 'createdBy'>,
) {
  return Boolean(
    capabilities?.canManage ||
    capabilities?.canEdit ||
    (actorId && thread.createdBy.id === actorId),
  );
}

export function canDeleteCommentThread(
  capabilities: Pick<StoryAccessCapabilities, 'canManage'> | undefined,
  actorId: string | undefined,
  thread: Pick<StoryCommentThread, 'createdBy'>,
) {
  return Boolean(capabilities?.canManage || (actorId && thread.createdBy.id === actorId));
}

export function isCommentAnchor(value: unknown): value is CommentAnchor {
  if (!isRecord(value)) return false;
  if (value.kind === 'canvas') {
    return (
      isRecord(value.position) &&
      Number.isFinite(value.position.x) &&
      Number.isFinite(value.position.y)
    );
  }
  if (value.kind === 'entity') {
    return isTargetType(value.targetType) && isIdentifier(value.targetId);
  }
  if (value.kind === 'field') {
    return (
      isTargetType(value.targetType) &&
      isIdentifier(value.targetId) &&
      isCommentEntityField(value.targetType, value.field)
    );
  }
  if (value.kind === 'section') {
    return (
      isTargetType(value.targetType) &&
      isIdentifier(value.targetId) &&
      isCommentEntitySection(value.targetType, value.section)
    );
  }
  if (value.kind !== 'text' || !isTargetType(value.targetType) || !isIdentifier(value.targetId)) {
    return false;
  }
  if (!['title', 'name', 'body', 'description'].includes(String(value.field))) return false;
  const selector = value.selector;
  return (
    isRecord(selector) &&
    typeof selector.exact === 'string' &&
    selector.exact.length > 0 &&
    selector.exact.length <= MAX_COMMENT_QUOTE_LENGTH &&
    typeof selector.prefix === 'string' &&
    selector.prefix.length <= 128 &&
    typeof selector.suffix === 'string' &&
    selector.suffix.length <= 128 &&
    typeof selector.start === 'number' &&
    Number.isInteger(selector.start) &&
    typeof selector.end === 'number' &&
    Number.isInteger(selector.end) &&
    selector.start >= 0 &&
    selector.end > selector.start &&
    typeof selector.sourceHash === 'string' &&
    selector.sourceHash.length <= 128
  );
}

export function commentAnchorBelongsToStory(story: Story, anchor: CommentAnchor) {
  if (anchor.kind === 'canvas') return true;
  const target = findCommentTarget(story, anchor.targetType, anchor.targetId);
  if (!target) return false;
  if (anchor.kind !== 'text') return true;
  return commentTextValue(target, anchor.targetType, anchor.field) !== undefined;
}

export function commentAnchorLabel(story: Story, anchor: CommentAnchor) {
  if (anchor.kind === 'canvas') return 'Story graph';
  const target = findCommentTarget(story, anchor.targetType, anchor.targetId);
  const label =
    target && 'title' in target
      ? target.title
      : target && 'name' in target
        ? target.name
        : anchor.targetId;
  if (anchor.kind === 'field' || anchor.kind === 'section') {
    return `${label}: ${commentAnchorSlotLabel(anchor)}`;
  }
  return anchor.kind === 'text' ? `${label}: “${anchor.selector.exact}”` : label;
}

export function isCommentAnchorDetached(story: Story, anchor: CommentAnchor) {
  if (anchor.kind === 'canvas') return false;
  const target = findCommentTarget(story, anchor.targetType, anchor.targetId);
  if (!target) return true;
  if (anchor.kind !== 'text') return false;
  const value = commentTextValue(target, anchor.targetType, anchor.field);
  if (value === undefined) return true;
  return locateCommentQuote(value, anchor.selector) === undefined;
}

export function commentSemanticSlotKey(slot: CommentSemanticSlot | CommentSemanticAnchor) {
  return slot.kind === 'field' ? `field:${slot.field}` : `section:${slot.section}`;
}

export function commentAnchorSlotLabel(anchor: CommentSemanticAnchor) {
  return anchor.kind === 'field'
    ? commentFieldLabels[anchor.field]
    : commentSectionLabels[anchor.section];
}

export function locateCommentQuote(value: string, selector: CommentTextSelector) {
  if (value.slice(selector.start, selector.end) === selector.exact) {
    return { start: selector.start, end: selector.end };
  }
  const matches: number[] = [];
  const contextualMatches: number[] = [];
  let index = value.indexOf(selector.exact);
  while (index >= 0) {
    matches.push(index);
    const prefixMatches =
      !selector.prefix ||
      value.slice(Math.max(0, index - selector.prefix.length), index) === selector.prefix;
    const end = index + selector.exact.length;
    const suffixMatches =
      !selector.suffix || value.slice(end, end + selector.suffix.length) === selector.suffix;
    if (prefixMatches && suffixMatches) contextualMatches.push(index);
    index = value.indexOf(selector.exact, index + 1);
  }
  const match =
    contextualMatches.length === 1
      ? contextualMatches[0]
      : matches.length === 1
        ? matches[0]
        : undefined;
  return match === undefined ? undefined : { start: match, end: match + selector.exact.length };
}

function findCommentTarget(story: Story, targetType: CommentTargetType, targetId: string) {
  if (targetType === 'interaction') return story.interactions.find(({ id }) => id === targetId);
  if (targetType === 'trigger') {
    return story.interactions.flatMap(({ triggers }) => triggers).find(({ id }) => id === targetId);
  }
  if (targetType === 'character') return story.characters?.find(({ id }) => id === targetId);
  if (targetType === 'location') return story.locations?.find(({ id }) => id === targetId);
  if (targetType === 'itemDefinition') {
    return story.itemDefinitions?.find(({ id }) => id === targetId);
  }
  return story.statDefinitions?.find(({ id }) => id === targetId);
}

function commentTextValue(target: object, targetType: CommentTargetType, field: CommentTextField) {
  if (field === 'body' && targetType !== 'interaction') return undefined;
  if (field === 'title' && targetType !== 'interaction') return undefined;
  if (field === 'name' && ['interaction', 'trigger'].includes(targetType)) return undefined;
  if (
    field === 'description' &&
    !['character', 'location', 'itemDefinition'].includes(targetType)
  ) {
    return undefined;
  }
  const value = (target as Record<string, unknown>)[field];
  if (typeof value !== 'string') return undefined;
  return field === 'body' ? richTextToPlainText(value) : value;
}

function richTextToPlainText(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (entity, code: string) => decodeCodePoint(entity, Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (entity, code: string) =>
      decodeCodePoint(entity, parseInt(code, 16)),
    );
}

function decodeCodePoint(entity: string, code: number) {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : entity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isTargetType(value: unknown): value is CommentTargetType {
  return [
    'interaction',
    'trigger',
    'character',
    'location',
    'itemDefinition',
    'statDefinition',
  ].includes(String(value));
}

function isCommentEntityField(targetType: CommentTargetType, field: unknown) {
  return (commentTargetSlots[targetType].fields as readonly string[]).includes(String(field));
}

function isCommentEntitySection(targetType: CommentTargetType, section: unknown) {
  return (commentTargetSlots[targetType].sections as readonly string[]).includes(String(section));
}

const commentFieldLabels: Record<CommentEntityField, string> = {
  location: 'Location',
  characters: 'Characters',
  duration: 'Duration',
  appearanceProbability: 'Appearance probability',
  timer: 'Timer',
  category: 'Category',
  imageUrl: 'Image URL',
  isPlayable: 'Playable character',
  valueType: 'Value type',
  changePerHour: 'Hourly change',
};

const commentSectionLabels: Record<CommentEntitySection, string> = {
  contextAndTiming: 'Context and timing',
  effects: 'Effects',
  conditions: 'Conditions',
  stats: 'Stats',
  items: 'Items',
  assignments: 'Assignments',
};
