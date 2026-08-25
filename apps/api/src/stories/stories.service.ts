import { Injectable } from '@nestjs/common';
import type {
  CharacterItemMutationResult,
  CharacterMutationResult,
  CharacterStatMutationResult,
  GraphDecorationMutationResult,
  InteractionMutationResult,
  ItemDefinitionMutationResult,
  LocationMutationResult,
  ReaderProgress,
  StatDefinitionMutationResult,
  Story,
  TriggerMutationResult,
  UserRole,
} from '@paralleax/shared';
import { StoryAccessService } from './application/story-access';
import { StoryContextService } from './application/story-context';
import { StoryGraphService } from './application/story-graph';
import { StoryMetadataService } from './application/story-metadata';
import { StoryReaderProgressService } from './application/story-reader-progress';
import type {
  CreateCharacterDto,
  CreateCharacterItemDto,
  CreateCharacterStatDto,
  CreateGraphDecorationDto,
  CreateInteractionDto,
  CreateItemDefinitionDto,
  CreateLocationDto,
  CreateStatAssignmentDto,
  CreateStatDefinitionDto,
  CreateStoryDto,
  CreateTriggerDto,
  MoveItemInstanceDto,
  SaveReaderProgressDto,
  SetStoryCollaboratorDto,
  UpdateCharacterDto,
  UpdateCharacterStatDto,
  UpdateGraphDecorationDto,
  UpdateInteractionDto,
  UpdateItemDefinitionDto,
  UpdateLocationDto,
  UpdateStatAssignmentDto,
  UpdateStatDefinitionDto,
  UpdateStoryAccessDto,
  UpdateStoryDto,
  UpdateTriggerDto,
} from './dto/stories.dto';

@Injectable()
export class StoriesService {
  constructor(
    private readonly metadata: StoryMetadataService,
    private readonly access: StoryAccessService,
    private readonly readerProgress: StoryReaderProgressService,
    private readonly graph: StoryGraphService,
    private readonly context: StoryContextService,
  ) {}

  async list(userId: string) {
    return this.metadata.list(userId);
  }

  async listPublic() {
    return this.metadata.listPublic();
  }

  async get(id: string, userId?: string): Promise<Story> {
    return this.metadata.get(id, userId);
  }

  async stream(id: string, userId: string) {
    return this.metadata.stream(id, userId);
  }

  async create(input: CreateStoryDto, userId: string): Promise<Story> {
    return this.metadata.create(input, userId);
  }

  async createDemo(userId: string, actorRole: UserRole): Promise<Story> {
    return this.metadata.createDemo(userId, actorRole);
  }

  async updateStory(id: string, input: UpdateStoryDto, userId: string): Promise<Story> {
    return this.metadata.update(id, input, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.metadata.delete(id, userId);
  }

  async getProgress(storyId: string, userId: string): Promise<ReaderProgress | null> {
    return this.readerProgress.get(storyId, userId);
  }

  async getAccess(storyId: string, userId: string) {
    return this.access.get(storyId, userId);
  }

  async updateAccess(storyId: string, input: UpdateStoryAccessDto, userId: string) {
    return this.access.update(storyId, input, userId);
  }

  async setCollaborator(storyId: string, input: SetStoryCollaboratorDto, userId: string) {
    return this.access.setCollaborator(storyId, input, userId);
  }

  async removeCollaborator(storyId: string, collaboratorId: string, userId: string) {
    await this.access.removeCollaborator(storyId, collaboratorId, userId);
  }

  async saveProgress(
    storyId: string,
    input: SaveReaderProgressDto,
    userId: string,
  ): Promise<ReaderProgress> {
    return this.readerProgress.save(storyId, input, userId);
  }

  async deleteProgress(storyId: string, userId: string): Promise<void> {
    await this.readerProgress.delete(storyId, userId);
  }

  async createInteraction(
    storyId: string,
    input: CreateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    return this.graph.createInteraction(storyId, input, userId);
  }

  async updateInteraction(
    storyId: string,
    interactionId: string,
    input: UpdateInteractionDto,
    userId: string,
  ): Promise<InteractionMutationResult> {
    return this.graph.updateInteraction(storyId, interactionId, input, userId);
  }

  async deleteInteraction(storyId: string, interactionId: string, userId: string): Promise<Story> {
    return this.graph.deleteInteraction(storyId, interactionId, userId);
  }

  async createGraphDecoration(
    storyId: string,
    input: CreateGraphDecorationDto,
    userId: string,
  ): Promise<GraphDecorationMutationResult> {
    return this.graph.createGraphDecoration(storyId, input, userId);
  }

  async updateGraphDecoration(
    storyId: string,
    decorationId: string,
    input: UpdateGraphDecorationDto,
    userId: string,
  ): Promise<GraphDecorationMutationResult> {
    return this.graph.updateGraphDecoration(storyId, decorationId, input, userId);
  }

  async deleteGraphDecoration(
    storyId: string,
    decorationId: string,
    userId: string,
  ): Promise<Story> {
    return this.graph.deleteGraphDecoration(storyId, decorationId, userId);
  }

  async addTrigger(
    storyId: string,
    interactionId: string,
    input: CreateTriggerDto,
    userId: string,
  ): Promise<TriggerMutationResult> {
    return this.graph.addTrigger(storyId, interactionId, input, userId);
  }

  async updateTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    input: UpdateTriggerDto,
    userId: string,
  ): Promise<TriggerMutationResult> {
    return this.graph.updateTrigger(storyId, interactionId, triggerId, input, userId);
  }

  async deleteTrigger(
    storyId: string,
    interactionId: string,
    triggerId: string,
    userId: string,
  ): Promise<Story> {
    return this.graph.deleteTrigger(storyId, interactionId, triggerId, userId);
  }

  async createLocation(
    storyId: string,
    input: CreateLocationDto,
    userId: string,
  ): Promise<LocationMutationResult> {
    return this.context.createLocation(storyId, input, userId);
  }

  async updateLocation(
    storyId: string,
    locationId: string,
    input: UpdateLocationDto,
    userId: string,
  ): Promise<LocationMutationResult> {
    return this.context.updateLocation(storyId, locationId, input, userId);
  }

  async createCharacter(
    storyId: string,
    input: CreateCharacterDto,
    userId: string,
  ): Promise<CharacterMutationResult> {
    return this.context.createCharacter(storyId, input, userId);
  }

  async updateCharacter(
    storyId: string,
    characterId: string,
    input: UpdateCharacterDto,
    userId: string,
  ): Promise<CharacterMutationResult> {
    return this.context.updateCharacter(storyId, characterId, input, userId);
  }

  async createStatDefinition(
    storyId: string,
    input: CreateStatDefinitionDto,
    userId: string,
  ): Promise<StatDefinitionMutationResult> {
    return this.context.createStatDefinition(storyId, input, userId);
  }

  async updateStatDefinition(
    storyId: string,
    statDefinitionId: string,
    input: UpdateStatDefinitionDto,
    userId: string,
  ): Promise<StatDefinitionMutationResult> {
    return this.context.updateStatDefinition(storyId, statDefinitionId, input, userId);
  }

  async deleteStatDefinition(
    storyId: string,
    statDefinitionId: string,
    userId: string,
  ): Promise<Story> {
    return this.context.deleteStatDefinition(storyId, statDefinitionId, userId);
  }

  async createStatAssignment(
    storyId: string,
    input: CreateStatAssignmentDto,
    userId: string,
  ): Promise<Story> {
    return this.context.createStatAssignment(storyId, input, userId);
  }

  async updateStatAssignment(
    storyId: string,
    statId: string,
    input: UpdateStatAssignmentDto,
    userId: string,
  ): Promise<Story> {
    return this.context.updateStatAssignment(storyId, statId, input, userId);
  }

  async deleteStatAssignment(storyId: string, statId: string, userId: string): Promise<Story> {
    return this.context.deleteStatAssignment(storyId, statId, userId);
  }

  async createItemDefinition(
    storyId: string,
    input: CreateItemDefinitionDto,
    userId: string,
  ): Promise<ItemDefinitionMutationResult> {
    return this.context.createItemDefinition(storyId, input, userId);
  }

  async updateItemDefinition(
    storyId: string,
    itemDefinitionId: string,
    input: UpdateItemDefinitionDto,
    userId: string,
  ): Promise<ItemDefinitionMutationResult> {
    return this.context.updateItemDefinition(storyId, itemDefinitionId, input, userId);
  }

  async createCharacterStat(
    storyId: string,
    characterId: string,
    input: CreateCharacterStatDto,
    userId: string,
  ): Promise<CharacterStatMutationResult> {
    return this.context.createCharacterStat(storyId, characterId, input, userId);
  }

  async updateCharacterStat(
    storyId: string,
    characterId: string,
    statId: string,
    input: UpdateCharacterStatDto,
    userId: string,
  ): Promise<CharacterStatMutationResult> {
    return this.context.updateCharacterStat(storyId, characterId, statId, input, userId);
  }

  async deleteCharacterStat(
    storyId: string,
    characterId: string,
    statId: string,
    userId: string,
  ): Promise<Story> {
    return this.context.deleteCharacterStat(storyId, characterId, statId, userId);
  }

  async createCharacterItem(
    storyId: string,
    characterId: string,
    input: CreateCharacterItemDto,
    userId: string,
  ): Promise<CharacterItemMutationResult> {
    return this.context.createCharacterItem(storyId, characterId, input, userId);
  }

  async moveItemInstance(
    storyId: string,
    itemId: string,
    input: MoveItemInstanceDto,
    userId: string,
  ): Promise<Story> {
    return this.context.moveItemInstance(storyId, itemId, input, userId);
  }

  async deleteCharacterItem(
    storyId: string,
    characterId: string,
    itemId: string,
    userId: string,
  ): Promise<Story> {
    return this.context.deleteCharacterItem(storyId, characterId, itemId, userId);
  }
}
