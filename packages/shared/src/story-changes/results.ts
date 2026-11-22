import type { StoryChangeCreatedEntity, StoryChangeDiagnostic } from './contract.js';
import type { StoryChangeSummary } from './summary.js';

/** Result of previewing a batch. Nothing is written. */
export interface StoryChangePreview {
  storyId: string;
  /** The Story revision the batch was applied to. Send it back to commit. */
  baseRevision: number;
  valid: boolean;
  /**
   * Digest of the user, Story, base revision and exact operations. Present only
   * when the batch is valid; a commit must send it with the same operations.
   */
  proposalId?: string;
  operationCount: number;
  /**
   * Entities the batch would create. Their IDs are provisional: the commit
   * assigns the final IDs and returns them with the same references.
   */
  createdEntities: StoryChangeCreatedEntity[];
  summary?: StoryChangeSummary;
  diagnostics: StoryChangeDiagnostic[];
}

/** Result of committing a previewed batch. */
export interface StoryChangeCommitResult {
  /**
   * `committed`: applied now. `already_applied`: an earlier commit of the same
   * proposal succeeded (for example when its response was lost); nothing was
   * written again.
   */
  status: 'committed' | 'already_applied';
  storyId: string;
  proposalId: string;
  baseRevision: number;
  /** The revision created by the commit of this proposal. */
  revision: number;
  createdEntities: StoryChangeCreatedEntity[];
  /** Present for `committed`. */
  summary?: StoryChangeSummary;
  /** For `already_applied`: the batch was undone from the history since. */
  reverted?: boolean;
}
