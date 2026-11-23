import { STORY_CHANGE_BATCH_VERSION } from '@paralleax/shared';
import type { ParalleaxApiClient } from '../api-client.js';
import { storyChangeCommitSchema, storyChangePreviewSchema } from '../api-contract.js';
import type { CommitStoryChangesInput, PreviewStoryChangesInput } from './change-schemas.js';
import { storyPath } from './story-read-tools.js';

const confirmationStep =
  'Show this summary and every warning to the author, and call commit_story_changes with this proposalId only after the author explicitly confirms.';
const correctionStep = 'Nothing can be committed. Fix the reported operations and preview again.';

/**
 * Previews a batch: the API applies it to an unsaved copy, returns the diff
 * and, when valid, stores it as a proposal that only a commit can apply.
 */
export async function previewStoryChanges(
  api: ParalleaxApiClient,
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
  return {
    ...result,
    idsAreProvisional: true,
    nextStep: result.valid ? confirmationStep : correctionStep,
  };
}

/**
 * Commits a stored proposal. The API applies exactly the previewed operations;
 * a retry of a committed proposal is answered, not reapplied.
 */
export function commitStoryChanges(api: ParalleaxApiClient, input: CommitStoryChangesInput) {
  return api.post(
    storyPath(input.storyId, '/changes/commit'),
    { version: STORY_CHANGE_BATCH_VERSION, proposalId: input.proposalId },
    storyChangeCommitSchema,
  );
}
