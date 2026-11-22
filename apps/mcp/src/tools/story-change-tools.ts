import { STORY_CHANGE_BATCH_VERSION } from '@paralleax/shared';
import type { ParalleaxApiClient } from '../api-client.js';
import { storyChangeCommitSchema, storyChangePreviewSchema } from '../api-contract.js';
import { ToolError } from '../tool-result.js';
import type { CommitStoryChangesInput, PreviewStoryChangesInput } from './change-schemas.js';
import { storyPath } from './story-read-tools.js';

interface StoredProposal {
  storyId: string;
  baseRevision: number;
  operations: PreviewStoryChangesInput['operations'];
  expiresAt: number;
}

export interface ProposalStoreOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

/**
 * Remembers the exact operations of each valid preview so that a commit only
 * names its proposal. It is a convenience of this process, not a guarantee:
 * the API recomputes the proposal digest from the operations, the user and
 * the revision, and refuses anything else. After a restart, preview again.
 */
export class ProposalStore {
  private readonly entries = new Map<string, StoredProposal>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: ProposalStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 60 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 50;
    this.now = options.now ?? Date.now;
  }

  remember(proposalId: string, proposal: Omit<StoredProposal, 'expiresAt'>): void {
    this.entries.delete(proposalId);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(proposalId, { ...proposal, expiresAt: this.now() + this.ttlMs });
  }

  find(storyId: string, proposalId: string): StoredProposal | undefined {
    const proposal = this.entries.get(proposalId);
    if (proposal?.storyId !== storyId) {
      return undefined;
    }
    if (proposal.expiresAt <= this.now()) {
      this.entries.delete(proposalId);
      return undefined;
    }
    return proposal;
  }
}

const confirmationStep =
  'Show this summary and every warning to the author, and call commit_story_changes with this proposalId only after the author explicitly confirms.';
const correctionStep = 'Nothing can be committed. Fix the reported operations and preview again.';

/** Previews a batch: the API applies it to an unsaved copy and returns the diff. */
export async function previewStoryChanges(
  api: ParalleaxApiClient,
  store: ProposalStore,
  input: PreviewStoryChangesInput,
) {
  const result = await api.post(
    storyPath(input.storyId, '/changes/preview'),
    {
      version: STORY_CHANGE_BATCH_VERSION,
      operations: input.operations,
      ...(input.expectedRevision === undefined ? {} : { baseRevision: input.expectedRevision }),
    },
    storyChangePreviewSchema,
  );
  if (result.valid && result.proposalId !== undefined) {
    store.remember(result.proposalId, {
      storyId: input.storyId,
      baseRevision: result.baseRevision,
      operations: input.operations,
    });
  }
  return {
    ...result,
    idsAreProvisional: true,
    nextStep: result.valid ? confirmationStep : correctionStep,
  };
}

/** Commits a previewed proposal. A retry of a committed proposal is answered, not reapplied. */
export async function commitStoryChanges(
  api: ParalleaxApiClient,
  store: ProposalStore,
  input: CommitStoryChangesInput,
) {
  const proposal = store.find(input.storyId, input.proposalId);
  if (proposal === undefined) {
    throw new ToolError(
      'PROPOSAL_NOT_FOUND',
      'This server has no valid preview with this proposalId for this story',
    );
  }
  return api.post(
    storyPath(input.storyId, '/changes/commit'),
    {
      version: STORY_CHANGE_BATCH_VERSION,
      proposalId: input.proposalId,
      baseRevision: proposal.baseRevision,
      operations: proposal.operations,
    },
    storyChangeCommitSchema,
  );
}
