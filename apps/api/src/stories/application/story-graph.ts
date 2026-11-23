import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  deleteGraphDecorationFromStory,
  deleteInteractionFromStory,
  deleteTriggerInStory,
  storyHistoryOperations,
  updateGraphDecorationInStory,
  updateStoryGraphPositions,
  type GraphDecorationMutationResult,
  type GraphDecorationDeletionResult,
  type InteractionDeletionResult,
  type InteractionMutationResult,
  type Story,
  type TriggerMutationResult,
  type TriggerDeletionResult,
} from '@paralleax/shared';
import type {
  CreateGraphDecorationDto,
  CreateInteractionDto,
  CreateTriggerDto,
  UpdateGraphDecorationDto,
  UpdateInteractionDto,
  UpdateStoryGraphPositionsDto,
  UpdateTriggerDto,
} from '../dto/stories.dto';
import { buildGraphDecoration } from './graph-decorations';
import {
  addInteraction,
  addTrigger,
  applyInteractionUpdate,
  applyTriggerUpdate,
  defaultInteractionPosition,
  findInteraction,
  validateNativeInteractionRelations,
} from './story-graph-edits';
import { storyMutationMetadata } from './story-mutation-results';
import { StoryMutationService } from './story-mutations';

type UpdateTriggerArgs = [
  storyId: string,
  interactionId: string,
  triggerId: string,
  input: UpdateTriggerDto,
  userId: string,
];

function validateGraphPositionUpdates(story: Story, input: UpdateStoryGraphPositionsDto): void {
  const interactionIds = new Set(story.interactions.map(({ id }) => id));
  const updatedInteractionIds = input.interactionUpdates.map(({ interactionId }) => interactionId);
  if (
    new Set(updatedInteractionIds).size !== updatedInteractionIds.length ||
    updatedInteractionIds.some((id) => !interactionIds.has(id))
  ) {
    throw new BadRequestException(
      'Graph interaction position targets must be unique and belong to the Story',
    );
  }
  assertUniqueTriggerPositionTargets(input.triggerUpdates);
  assertTriggerPositionsBelongToInteractions(story, input.triggerUpdates);
}

function assertUniqueTriggerPositionTargets(
  updates: UpdateStoryGraphPositionsDto['triggerUpdates'],
): void {
  const updatedTriggerKeys = updates.flatMap(({ interactionId, triggerIds }) =>
    triggerIds.map((triggerId) => `${interactionId}:${triggerId}`),
  );
  if (new Set(updatedTriggerKeys).size !== updatedTriggerKeys.length) {
    throw new BadRequestException('Graph Trigger position targets must be unique');
  }
}

function assertTriggerPositionsBelongToInteractions(
  story: Story,
  updates: UpdateStoryGraphPositionsDto['triggerUpdates'],
): void {
  for (const { interactionId, triggerIds } of updates) {
    const interaction = story.interactions.find(({ id }) => id === interactionId);
    const storyTriggerIds = new Set(interaction?.triggers.map(({ id }) => id) ?? []);
    if (!interaction || triggerIds.some((triggerId) => !storyTriggerIds.has(triggerId))) {
      throw new BadRequestException(
        'Graph Trigger position targets must belong to their Story interaction',
      );
    }
  }
}

@Injectable()
export class StoryGraphService {
  constructor(private readonly mutations: StoryMutationService) {}

  /** Reuse editor reference and effect rules after a native file's structural checks. */
  validateNativeInteractionRelations(
    story: Story,
    interaction: Story['interactions'][number],
  ): string | undefined {
    return validateNativeInteractionRelations(story, interaction);
  }

  async createInteraction(
    storyId: string,
    input: CreateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    const interactionId = randomUUID();
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        if (input.parentId && !story.interactions.some((item) => item.id === input.parentId)) {
          throw new NotFoundException('Parent interaction not found');
        }
        return addInteraction(story, {
          interactionId,
          inputInteractionIds: input.parentId ? [input.parentId] : [],
          position: input.position ?? defaultInteractionPosition(story),
        });
      },
      userId,
      storyHistoryOperations.interactionCreated,
    );
    return this.interactionResult(updatedStory, interactionId);
  }

  async updateInteraction(
    storyId: string,
    interactionId: string,
    input: UpdateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => applyInteractionUpdate(story, interactionId, input),
      userId,
      storyHistoryOperations.interactionUpdated,
    );
    return this.interactionResult(updatedStory, interactionId);
  }

  async updatePositions(storyId: string, input: UpdateStoryGraphPositionsDto, userId: string) {
    if (input.interactionUpdates.length === 0 && input.triggerUpdates.length === 0) {
      throw new BadRequestException('At least one graph position update is required');
    }
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        validateGraphPositionUpdates(story, input);
        return updateStoryGraphPositions(story, input);
      },
      userId,
      storyHistoryOperations.graphPositionsUpdated,
    );
    return storyMutationMetadata(updatedStory);
  }

  async deleteInteraction(
    storyId: string,
    interactionId: string,
    userId: string,
  ): Promise<InteractionDeletionResult> {
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        findInteraction(story, interactionId);
        return deleteInteractionFromStory(story, interactionId);
      },
      userId,
      storyHistoryOperations.interactionDeleted,
    );
    return { ...storyMutationMetadata(updatedStory), interactionId };
  }

  async createGraphDecoration(
    storyId: string,
    input: CreateGraphDecorationDto,
    userId: string,
  ): Promise<GraphDecorationMutationResult> {
    const decorationId = randomUUID();
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        (story.graphDecorations ??= []).push(buildGraphDecoration(decorationId, input));
        return story;
      },
      userId,
      storyHistoryOperations.graphDecorationCreated,
    );
    return this.graphDecorationResult(updatedStory, decorationId);
  }

  async updateGraphDecoration(
    storyId: string,
    decorationId: string,
    input: UpdateGraphDecorationDto,
    userId: string,
  ): Promise<GraphDecorationMutationResult> {
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        this.graphDecoration(story, decorationId);
        return updateGraphDecorationInStory(story, decorationId, input);
      },
      userId,
      storyHistoryOperations.graphDecorationUpdated,
    );
    return this.graphDecorationResult(updatedStory, decorationId);
  }

  async deleteGraphDecoration(
    storyId: string,
    decorationId: string,
    userId: string,
  ): Promise<GraphDecorationDeletionResult> {
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        this.graphDecoration(story, decorationId);
        return deleteGraphDecorationFromStory(story, decorationId);
      },
      userId,
      storyHistoryOperations.graphDecorationDeleted,
    );
    return { ...storyMutationMetadata(updatedStory), decorationId };
  }

  async updateTrigger(...args: UpdateTriggerArgs): Promise<TriggerMutationResult> {
    const [storyId, interactionId, triggerId, input, userId] = args;
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => applyTriggerUpdate(story, interactionId, triggerId, input),
      userId,
      storyHistoryOperations.triggerUpdated,
    );
    return this.triggerResult(updatedStory, interactionId, triggerId);
  }

  async addTrigger(
    storyId: string,
    interactionId: string,
    input: CreateTriggerDto,
    userId: string,
  ): Promise<TriggerMutationResult> {
    const triggerId = randomUUID();
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => addTrigger(story, interactionId, triggerId, input),
      userId,
      storyHistoryOperations.triggerCreated,
    );
    return this.triggerResult(updatedStory, interactionId, triggerId);
  }

  async deleteTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    userId: string,
  ): Promise<TriggerDeletionResult> {
    let triggerRemoved = false;
    const updatedStory = await this.mutations.update(
      storyId,
      (story) => {
        const interaction = findInteraction(story, interactionId);
        if (!interaction.triggers.some((item) => item.id === triggerId)) {
          throw new NotFoundException('Trigger not found');
        }
        triggerRemoved = interaction.triggers.length > 1;
        return deleteTriggerInStory(story, interactionId, triggerId);
      },
      userId,
      storyHistoryOperations.triggerDeleted,
    );
    return { ...storyMutationMetadata(updatedStory), interactionId, triggerId, triggerRemoved };
  }

  private graphDecoration(story: Story, id: string) {
    const decoration = (story.graphDecorations ?? []).find((item) => item.id === id);
    if (!decoration) {
      throw new NotFoundException('Graph decoration not found');
    }
    return decoration;
  }

  private interactionResult(story: Story, interactionId: string): InteractionMutationResult {
    return {
      interaction: structuredClone(findInteraction(story, interactionId)),
      ...storyMutationMetadata(story),
    };
  }

  private graphDecorationResult(story: Story, decorationId: string): GraphDecorationMutationResult {
    return {
      decoration: structuredClone(this.graphDecoration(story, decorationId)),
      ...storyMutationMetadata(story),
    };
  }

  private triggerResult(
    story: Story,
    interactionId: string,
    triggerId: string,
  ): TriggerMutationResult {
    const trigger = findInteraction(story, interactionId).triggers.find(
      ({ id }) => id === triggerId,
    );
    if (!trigger) {
      throw new NotFoundException('Trigger not found');
    }
    return {
      interactionId,
      trigger: structuredClone(trigger),
      ...storyMutationMetadata(story),
    };
  }
}
