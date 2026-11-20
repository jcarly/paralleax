import { randomUUID } from 'node:crypto';
import { ParalleaxApiError, pathSegment, type ParalleaxApiClient } from '../api-client.js';
import { interactionMutationSchema, triggerMutationSchema } from '../api-contract.js';
import { ToolError, toolErrorPayload } from '../tool-result.js';
import { nextInteractionPosition } from './placement.js';
import type {
  CreateInteractionInput,
  CreateTriggerInput,
  UpdateInteractionInput,
} from './schemas.js';
import { storyPath } from './story-read-tools.js';
import { interactionMutationView, triggerView } from './story-projection.js';

function interactionPath(storyId: string, interactionId: string, suffix = ''): string {
  return storyPath(storyId, `/interactions/${pathSegment(interactionId)}${suffix}`);
}

async function saveCreatedContent(
  api: ParalleaxApiClient,
  input: CreateInteractionInput,
  created: { interactionId: string; revision: number },
) {
  try {
    return await api.patch(
      interactionPath(input.storyId, created.interactionId),
      { title: input.title, ...(input.body === undefined ? {} : { body: input.body }) },
      interactionMutationSchema,
    );
  } catch (error) {
    if (!(error instanceof ParalleaxApiError)) {
      throw error;
    }
    throw new ToolError(
      'PARTIALLY_APPLIED',
      'The interaction was created but its title and body were not saved; complete it with update_interaction',
      {
        createdInteractionId: created.interactionId,
        revision: created.revision,
        cause: toolErrorPayload(error),
      },
    );
  }
}

/**
 * Creates an interaction with the same two API calls the editor makes: create
 * (optionally from a parent, which wires the default Trigger) then edit the
 * content. If the second call fails, the created interaction is reported so the
 * assistant completes it with update_interaction instead of creating another.
 */
export async function createInteraction(api: ParalleaxApiClient, input: CreateInteractionInput) {
  const position =
    input.position ??
    (await nextInteractionPosition(api, input.storyId, input.parentInteractionId));
  const created = await api.post(
    storyPath(input.storyId, '/interactions'),
    {
      ...(input.parentInteractionId === undefined ? {} : { parentId: input.parentInteractionId }),
      position,
    },
    interactionMutationSchema,
  );
  const updated = await saveCreatedContent(api, input, {
    interactionId: created.interaction.id,
    revision: created.revision,
  });
  return {
    ...interactionMutationView(updated),
    connectedFrom: input.parentInteractionId ?? null,
    bodyChangedBySanitizer: input.body !== undefined && updated.interaction.body !== input.body,
  };
}

export async function updateInteraction(api: ParalleaxApiClient, input: UpdateInteractionInput) {
  const result = await api.patch(
    interactionPath(input.storyId, input.interactionId),
    input.changes,
    interactionMutationSchema,
  );
  return {
    ...interactionMutationView(result),
    bodyChangedBySanitizer:
      input.changes.body !== undefined && result.interaction.body !== input.changes.body,
  };
}

function triggerRequestBody(input: CreateTriggerInput) {
  return {
    inputInteractionIds: input.inputInteractionIds,
    ...(input.conditionGroups === undefined
      ? {}
      : {
          conditionGroups: input.conditionGroups.map((group) => ({
            id: group.id ?? randomUUID(),
            conditions: group.conditions,
          })),
        }),
    ...(input.appearanceProbability === undefined
      ? {}
      : { appearanceProbability: input.appearanceProbability }),
    ...(input.timerSeconds === undefined ? {} : { timerSeconds: input.timerSeconds }),
  };
}

export async function createTrigger(api: ParalleaxApiClient, input: CreateTriggerInput) {
  const result = await api.post(
    interactionPath(input.storyId, input.targetInteractionId, '/triggers'),
    triggerRequestBody(input),
    triggerMutationSchema,
  );
  return { revision: result.revision, trigger: triggerView(result.trigger, result.interactionId) };
}
