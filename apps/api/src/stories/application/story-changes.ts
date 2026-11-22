import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  DomainValidationError,
  STORY_CHANGE_BATCH_VERSION,
  createStoryChangeDelta,
  summarizeStoryChanges,
  type Story,
  type StoryChangeCommitResult,
  type StoryChangeCreatedEntity,
  type StoryChangeDiagnostic,
  type StoryChangePreview,
} from '@paralleax/shared';
import { ApplicationConflictError } from '../../operations/application-errors';
import type { CommitStoryChangesDto, PreviewStoryChangesDto } from '../dto/story-changes.dto';
import { StoriesRepository, type StoryChangeProposalCommit } from '../stories.repository';
import { assertStoryWithinQuotas } from '../story-quotas';
import {
  applyStoryChangePlan,
  planStoryChanges,
  ruleDiagnostic,
  type StoryChangePlan,
} from './story-change-plan';
import { canonicalJson } from './canonical-json';
import { StoryMutationService } from './story-mutations';

interface ProposalResult {
  createdEntities: StoryChangeCreatedEntity[];
}

function readProposalResult(value: unknown): ProposalResult {
  const createdEntities: unknown =
    typeof value === 'object' && value !== null ? Reflect.get(value, 'createdEntities') : undefined;
  if (!Array.isArray(createdEntities) || !createdEntities.every(isCreatedEntity)) {
    throw new Error('A committed change proposal has no valid created entity list');
  }
  return { createdEntities };
}

function isCreatedEntity(value: unknown): value is StoryChangeCreatedEntity {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const kind: unknown = Reflect.get(value, 'kind');
  return (
    (kind === 'interaction' || kind === 'trigger') &&
    typeof Reflect.get(value, 'id') === 'string' &&
    typeof Reflect.get(value, 'operationIndex') === 'number'
  );
}

/**
 * Preview and commit of editorial change batches (ADR-050). A preview applies
 * the batch to a consistent, unpersisted copy. A commit recomputes everything
 * from the exact operations under the Story lock and persists one revision and
 * one history event; it never trusts a client-supplied diff.
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
    return {
      ...result,
      valid: true,
      proposalId: proposalDigest({ storyId, userId, baseRevision, operations: input.operations }),
      summary: summarizeStoryChanges(snapshot, applied.story, delta, refsById(plan)),
      diagnostics,
    };
  }

  async commit(
    storyId: string,
    input: CommitStoryChangesDto,
    userId: string,
  ): Promise<StoryChangeCommitResult> {
    const { baseRevision, operations, proposalId } = input;
    if (proposalDigest({ storyId, userId, baseRevision, operations }) !== proposalId) {
      throw new ApplicationConflictError(
        'STORY_CHANGE_PROPOSAL_MISMATCH',
        'The operations, base revision, Story or user differ from the previewed proposal.',
      );
    }
    const plan = planStoryChanges(operations, randomUUID);
    if (hasErrors(plan.diagnostics)) {
      throw invalidBatch(plan.diagnostics);
    }
    let before: Story | undefined;
    const committed = await this.mutations.commitProposal({
      storyId,
      userId,
      proposal: {
        digest: proposalId,
        result: { createdEntities: plan.created } satisfies ProposalResult,
      },
      mutation: (story) => {
        if (storyRevision(story) !== baseRevision) {
          throw revisionConflict(baseRevision, storyRevision(story));
        }
        const original = structuredClone(story);
        before = original;
        return applyCommittedPlan(original, story, plan);
      },
    });
    return commitResult(committed, { storyId, proposalId, baseRevision }, plan, before);
  }
}

function commitResult(
  committed: StoryChangeProposalCommit,
  identity: Pick<StoryChangeCommitResult, 'storyId' | 'proposalId' | 'baseRevision'>,
  plan: StoryChangePlan,
  before: Story | undefined,
): StoryChangeCommitResult {
  if (committed.kind === 'replayed') {
    return {
      status: 'already_applied',
      ...identity,
      revision: committed.proposal.revision,
      createdEntities: readProposalResult(committed.proposal.result).createdEntities,
      reverted: committed.proposal.reverted,
    };
  }
  const after = committed.story;
  const original = before ?? after;
  return {
    status: 'committed',
    ...identity,
    revision: storyRevision(after),
    createdEntities: plan.created,
    summary: summarizeStoryChanges(
      original,
      after,
      createStoryChangeDelta(original, after),
      refsById(plan),
    ),
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

/**
 * The proposal identity: user, Story, base revision and exact operations, in a
 * canonical key order. A different user, Story, revision or any changed
 * operation produces another digest. It is not a secret: it binds a commit to
 * what was previewed, while permissions and the revision are checked again.
 */
export function proposalDigest(input: {
  storyId: string;
  userId: string;
  baseRevision: number;
  operations: readonly unknown[];
}): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        version: STORY_CHANGE_BATCH_VERSION,
        storyId: input.storyId,
        userId: input.userId,
        baseRevision: input.baseRevision,
        operations: input.operations,
      }),
    )
    .digest('hex');
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
