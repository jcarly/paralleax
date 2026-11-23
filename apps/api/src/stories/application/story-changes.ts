import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  DomainValidationError,
  STORY_CHANGE_ENTITY_KINDS,
  createStoryChangeDelta,
  summarizeStoryChanges,
  type Story,
  type StoryChangeCommitResult,
  type StoryChangeCreatedEntity,
  type StoryChangeDiagnostic,
  type StoryChangeEntityKind,
  type StoryChangePreview,
} from '@paralleax/shared';
import {
  ApplicationConflictError,
  ApplicationNotFoundError,
} from '../../operations/application-errors';
import type { CommitStoryChangesDto, PreviewStoryChangesDto } from '../dto/story-changes.dto';
import type { StoredStoryChangeProposal } from '../persistence/story-change-proposals.persistence';
import { StoriesRepository, type StoryChangeProposalCommit } from '../stories.repository';
import { assertStoryWithinQuotas } from '../story-quotas';
import {
  applyStoryChangePlan,
  planStoryChanges,
  ruleDiagnostic,
  type StoryChangePlan,
} from './story-change-plan';
import { StoryMutationService } from './story-mutations';

/** How long a previewed proposal can be committed, and how many a user keeps. */
export const STORY_CHANGE_PROPOSAL_TTL_MS = 60 * 60 * 1000;
export const STORY_CHANGE_PROPOSALS_PER_USER = 20;

interface ProposalResult {
  baseRevision: number;
  createdEntities: StoryChangeCreatedEntity[];
}

function readProposalResult(value: unknown): ProposalResult {
  const record = typeof value === 'object' && value !== null ? value : {};
  const createdEntities: unknown = Reflect.get(record, 'createdEntities');
  const baseRevision: unknown = Reflect.get(record, 'baseRevision');
  if (
    typeof baseRevision !== 'number' ||
    !Array.isArray(createdEntities) ||
    !createdEntities.every(isCreatedEntity)
  ) {
    throw new Error('A committed change proposal has no valid result');
  }
  return { baseRevision, createdEntities };
}

function isCreatedEntity(value: unknown): value is StoryChangeCreatedEntity {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const kind: unknown = Reflect.get(value, 'kind');
  return (
    isStoryChangeEntityKind(kind) &&
    typeof Reflect.get(value, 'id') === 'string' &&
    typeof Reflect.get(value, 'operationIndex') === 'number'
  );
}

function isStoryChangeEntityKind(value: unknown): value is StoryChangeEntityKind {
  return (STORY_CHANGE_ENTITY_KINDS as readonly unknown[]).includes(value);
}

/**
 * Preview and commit of editorial change batches (ADR-050). A preview applies
 * the batch to a consistent, unpersisted copy and, when it is valid, stores the
 * exact operations as a proposal for this user, Story and revision. A commit
 * names that proposal only: it replans the stored operations under the Story
 * lock and persists one revision and one history event. It never trusts
 * client-supplied operations or diffs at commit time.
 */
@Injectable()
export class StoryChangesService {
  constructor(
    private readonly repository: StoriesRepository,
    private readonly mutations: StoryMutationService,
  ) {}

  async preview(
    storyId: string,
    input: PreviewStoryChangesDto,
    userId: string,
  ): Promise<StoryChangePreview> {
    const snapshot = await this.repository.findEditableSnapshot(storyId, userId);
    if (snapshot === undefined || snapshot === 'forbidden') {
      return this.mutations.accessError(storyId, userId);
    }
    const baseRevision = storyRevision(snapshot);
    if (input.baseRevision !== undefined && input.baseRevision !== baseRevision) {
      throw revisionConflict(input.baseRevision, baseRevision);
    }
    const plan = planStoryChanges(input.operations, randomUUID);
    const result: StoryChangePreview = {
      storyId,
      baseRevision,
      valid: false,
      operationCount: input.operations.length,
      createdEntities: plan.created,
      diagnostics: plan.diagnostics,
    };
    if (hasErrors(plan.diagnostics)) {
      return result;
    }
    const applied = applyStoryChangePlan(structuredClone(snapshot), plan);
    const diagnostics = withFinalStoryDiagnostics(applied.diagnostics, snapshot, applied.story);
    const delta = createStoryChangeDelta(snapshot, applied.story);
    if (hasErrors(diagnostics)) {
      return { ...result, diagnostics };
    }
    const proposal = await this.storeProposal(storyId, userId, baseRevision, input.operations);
    return {
      ...result,
      valid: true,
      ...proposal,
      summary: summarizeStoryChanges(snapshot, applied.story, delta, {
        refsById: refsById(plan),
        provisionalIds: true,
      }),
      diagnostics,
    };
  }

  /** Stores the exact previewed operations; only a commit of this ID can apply them. */
  private async storeProposal(
    storyId: string,
    userId: string,
    baseRevision: number,
    operations: unknown[],
  ): Promise<{ proposalId: string; expiresAt: string }> {
    const proposalId = randomBytes(32).toString('hex');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + STORY_CHANGE_PROPOSAL_TTL_MS).toISOString();
    await this.repository.saveChangeProposal(
      {
        id: proposalId,
        storyId,
        userId,
        baseRevision,
        operations,
        createdAt: createdAt.toISOString(),
        expiresAt,
      },
      STORY_CHANGE_PROPOSALS_PER_USER,
    );
    return { proposalId, expiresAt };
  }

  async commit(
    storyId: string,
    input: CommitStoryChangesDto,
    userId: string,
  ): Promise<StoryChangeCommitResult> {
    const { proposalId } = input;
    let before: Story | undefined;
    let plan: StoryChangePlan | undefined;
    const committed = await this.mutations.commitProposal({
      storyId,
      userId,
      proposalId,
      build: (proposal) => {
        const planned = planCommittedProposal(proposal);
        plan = planned;
        return {
          result: {
            baseRevision: proposal.baseRevision,
            createdEntities: planned.created,
          } satisfies ProposalResult,
          mutation: (story) => {
            if (storyRevision(story) !== proposal.baseRevision) {
              throw revisionConflict(proposal.baseRevision, storyRevision(story));
            }
            const original = structuredClone(story);
            before = original;
            return applyCommittedPlan(original, story, planned);
          },
        };
      },
    });
    return commitResult(committed, { storyId, proposalId }, plan, before);
  }
}

/** Replans the stored operations; they were valid at preview on this revision. */
function planCommittedProposal(proposal: StoredStoryChangeProposal): StoryChangePlan {
  const plan = planStoryChanges(proposal.operations, randomUUID);
  if (hasErrors(plan.diagnostics)) {
    throw invalidBatch(plan.diagnostics);
  }
  return plan;
}

function commitResult(
  committed: StoryChangeProposalCommit,
  identity: Pick<StoryChangeCommitResult, 'storyId' | 'proposalId'>,
  plan: StoryChangePlan | undefined,
  before: Story | undefined,
): StoryChangeCommitResult {
  if (committed.kind === 'missing') {
    throw new ApplicationNotFoundError(
      'STORY_CHANGE_PROPOSAL_NOT_FOUND',
      'No unexpired preview of this user matches this proposal. Preview the batch again.',
    );
  }
  if (committed.kind === 'replayed') {
    const result = readProposalResult(committed.proposal.result);
    return {
      status: 'already_applied',
      ...identity,
      baseRevision: result.baseRevision,
      revision: committed.proposal.revision,
      createdEntities: result.createdEntities,
      reverted: committed.proposal.reverted,
    };
  }
  const after = committed.story;
  const original = before ?? after;
  return {
    status: 'committed',
    ...identity,
    baseRevision: storyRevision(original),
    revision: storyRevision(after),
    createdEntities: plan?.created ?? [],
    summary: summarizeStoryChanges(original, after, createStoryChangeDelta(original, after), {
      refsById: plan === undefined ? new Map() : refsById(plan),
    }),
  };
}

function applyCommittedPlan(original: Story, story: Story, plan: StoryChangePlan): Story {
  const applied = applyStoryChangePlan(story, plan);
  const diagnostics = withFinalStoryDiagnostics(applied.diagnostics, original, applied.story);
  if (hasErrors(diagnostics)) {
    throw invalidBatch(diagnostics);
  }
  return applied.story;
}

/** Adds the whole-batch checks once every operation applied without error. */
function withFinalStoryDiagnostics(
  diagnostics: StoryChangeDiagnostic[],
  before: Story,
  after: Story,
): StoryChangeDiagnostic[] {
  return hasErrors(diagnostics)
    ? diagnostics
    : [...diagnostics, ...finalStoryDiagnostics(before, after)];
}

/** Checks the batch as a whole: it must change something and fit the quotas. */
function finalStoryDiagnostics(before: Story, after: Story): StoryChangeDiagnostic[] {
  if (!createStoryChangeDelta(before, after)) {
    return [
      {
        severity: 'error',
        operationIndex: null,
        code: 'NO_CHANGES',
        message: 'The batch does not change the Story.',
      },
    ];
  }
  try {
    assertStoryWithinQuotas(after, before);
    return [];
  } catch (error) {
    return [ruleDiagnostic(error, null)];
  }
}

function refsById(plan: StoryChangePlan): Map<string, string> {
  return new Map(
    plan.created.flatMap(({ id, ref }) => (ref === undefined ? [] : [[id, ref] as const])),
  );
}

function storyRevision(story: Story): number {
  return story.revision ?? 1;
}

function hasErrors(diagnostics: readonly StoryChangeDiagnostic[]): boolean {
  return diagnostics.some(({ severity }) => severity === 'error');
}

function revisionConflict(expectedRevision: number, currentRevision: number) {
  return new ApplicationConflictError(
    'STORY_REVISION_CONFLICT',
    'The Story has changed since this batch was prepared. Read it again and preview a new batch.',
    { expectedRevision, currentRevision },
  );
}

function invalidBatch(diagnostics: StoryChangeDiagnostic[]) {
  return new DomainValidationError('STORY_CHANGES_INVALID', 'The change batch is invalid.', {
    diagnostics: diagnostics.filter(({ severity }) => severity === 'error'),
  });
}
