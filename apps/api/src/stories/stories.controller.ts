import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Sse,
} from '@nestjs/common';
import {
  CreateInteractionDto,
  CreateStatAssignmentDto,
  CreateGraphDecorationDto,
  CreateCharacterDto,
  CreateCharacterItemDto,
  CreateCharacterStatDto,
  CreateItemDefinitionDto,
  CreateLocationDto,
  CreateReaderSaveDto,
  MoveItemInstanceDto,
  CreateStatDefinitionDto,
  CreateStoryDto,
  ImportChoiceScriptDto,
  CreateTriggerDto,
  SaveReaderProgressDto,
  UpdateInteractionDto,
  UpdateStatAssignmentDto,
  UpdateGraphDecorationDto,
  UpdateCharacterDto,
  UpdateCharacterStatDto,
  UpdateItemDefinitionDto,
  UpdateLocationDto,
  UpdateReaderSaveDto,
  UpdateStatDefinitionDto,
  UpdateStoryDto,
  UpdateTriggerDto,
  UpdateStoryAccessDto,
  SetStoryCollaboratorDto,
} from './dto/stories.dto';
import { StoriesService } from './stories.service';
import { ChoiceScriptImportService } from './application/choicescript-import';
import { CurrentUser, OptionalAuth, Public, type RequestUser } from '../auth/auth.decorators';
import { Throttle } from '@nestjs/throttler';

export const STORY_MUTATION_RATE_LIMIT = 60;
export const STORY_READ_RATE_LIMIT = 100;

@Throttle({ default: { limit: STORY_MUTATION_RATE_LIMIT, ttl: 60_000 } })
@Controller('stories')
export class StoriesController {
  constructor(
    private readonly stories: StoriesService,
    private readonly choiceScriptImports: ChoiceScriptImportService,
  ) {}

  @Get()
  @Throttle({ default: { limit: STORY_READ_RATE_LIMIT, ttl: 60_000 } })
  list(@CurrentUser() user: RequestUser) {
    return this.stories.list(user.id);
  }

  @Public()
  @Get('public')
  @Throttle({ default: { limit: STORY_READ_RATE_LIMIT, ttl: 60_000 } })
  listPublic() {
    return this.stories.listPublic();
  }

  @Post() create(@Body() input: CreateStoryDto, @CurrentUser() user: RequestUser) {
    return this.stories.create(input, user.id);
  }

  @Post('demo')
  createDemo(@CurrentUser() user: RequestUser) {
    return this.stories.createDemo(user.id, user.role);
  }

  @Post('imports/choicescript')
  importChoiceScript(@Body() input: ImportChoiceScriptDto, @CurrentUser() user: RequestUser) {
    return this.choiceScriptImports.create(input, user.id);
  }

  @Get(':storyId')
  @OptionalAuth()
  @Throttle({ default: { limit: STORY_READ_RATE_LIMIT, ttl: 60_000 } })
  get(@Param('storyId') id: string, @CurrentUser() user?: RequestUser) {
    return this.stories.get(id, user?.id);
  }

  @Sse(':storyId/events')
  @Header('X-Accel-Buffering', 'no')
  @Throttle({ default: { limit: STORY_READ_RATE_LIMIT, ttl: 60_000 } })
  stream(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return this.stories.stream(id, user.id);
  }

  @Get(':storyId/access')
  getAccess(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return this.stories.getAccess(id, user.id);
  }

  @Patch(':storyId/access')
  updateAccess(
    @Param('storyId') id: string,
    @Body() input: UpdateStoryAccessDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateAccess(id, input, user.id);
  }

  @Post(':storyId/access/collaborators')
  setCollaborator(
    @Param('storyId') id: string,
    @Body() input: SetStoryCollaboratorDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.setCollaborator(id, input, user.id);
  }

  @Delete(':storyId/access/collaborators/:userId')
  @HttpCode(204)
  removeCollaborator(
    @Param('storyId') id: string,
    @Param('userId') collaboratorId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.removeCollaborator(id, collaboratorId, user.id);
  }

  @Get(':storyId/progress')
  @Throttle({ default: { limit: STORY_READ_RATE_LIMIT, ttl: 60_000 } })
  async getProgress(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return { progress: await this.stories.getProgress(id, user.id) };
  }

  @Patch(':storyId/progress')
  saveProgress(
    @Param('storyId') id: string,
    @Body() input: SaveReaderProgressDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.saveProgress(id, input, user.id);
  }

  @Delete(':storyId/progress')
  @HttpCode(204)
  deleteProgress(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return this.stories.deleteProgress(id, user.id);
  }

  @Get(':storyId/progress/simulation')
  @Throttle({ default: { limit: STORY_READ_RATE_LIMIT, ttl: 60_000 } })
  async getSimulationProgress(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return { progress: await this.stories.getProgress(id, user.id, 'simulation') };
  }

  @Patch(':storyId/progress/simulation')
  saveSimulationProgress(
    @Param('storyId') id: string,
    @Body() input: SaveReaderProgressDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.saveProgress(id, input, user.id, 'simulation');
  }

  @Delete(':storyId/progress/simulation')
  @HttpCode(204)
  deleteSimulationProgress(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return this.stories.deleteProgress(id, user.id, 'simulation');
  }

  @Get(':storyId/progress/saves')
  @Throttle({ default: { limit: STORY_READ_RATE_LIMIT, ttl: 60_000 } })
  listReaderSaves(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return this.stories.listReaderSaves(id, user.id);
  }

  @Post(':storyId/progress/saves')
  createReaderSave(
    @Param('storyId') id: string,
    @Body() input: CreateReaderSaveDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createReaderSave(id, input, user.id);
  }

  @Get(':storyId/progress/saves/:saveId')
  @Throttle({ default: { limit: STORY_READ_RATE_LIMIT, ttl: 60_000 } })
  getReaderSave(
    @Param('storyId') id: string,
    @Param('saveId') saveId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.getReaderSave(id, saveId, user.id);
  }

  @Patch(':storyId/progress/saves/:saveId')
  updateReaderSave(
    @Param('storyId') id: string,
    @Param('saveId') saveId: string,
    @Body() input: UpdateReaderSaveDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateReaderSave(id, saveId, input, user.id);
  }

  @Delete(':storyId/progress/saves/:saveId')
  @HttpCode(204)
  deleteReaderSave(
    @Param('storyId') id: string,
    @Param('saveId') saveId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.deleteReaderSave(id, saveId, user.id);
  }

  @Patch(':storyId') update(
    @Param('storyId') id: string,
    @Body() input: UpdateStoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateStory(id, input, user.id);
  }

  @Delete(':storyId')
  @HttpCode(204)
  delete(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return this.stories.delete(id, user.id);
  }

  @Post(':storyId/interactions') createInteraction(
    @Param('storyId') id: string,
    @Body() input: CreateInteractionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createInteraction(id, input, user.id);
  }

  @Patch(':storyId/interactions/:interactionId') updateInteraction(
    @Param('storyId') storyId: string,
    @Param('interactionId') interactionId: string,
    @Body() input: UpdateInteractionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateInteraction(storyId, interactionId, input, user.id);
  }

  @Delete(':storyId/interactions/:interactionId') deleteInteraction(
    @Param('storyId') storyId: string,
    @Param('interactionId') interactionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.deleteInteraction(storyId, interactionId, user.id);
  }

  @Post(':storyId/graph-decorations') createGraphDecoration(
    @Param('storyId') storyId: string,
    @Body() input: CreateGraphDecorationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createGraphDecoration(storyId, input, user.id);
  }

  @Patch(':storyId/graph-decorations/:decorationId') updateGraphDecoration(
    @Param('storyId') storyId: string,
    @Param('decorationId') decorationId: string,
    @Body() input: UpdateGraphDecorationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateGraphDecoration(storyId, decorationId, input, user.id);
  }

  @Delete(':storyId/graph-decorations/:decorationId') deleteGraphDecoration(
    @Param('storyId') storyId: string,
    @Param('decorationId') decorationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.deleteGraphDecoration(storyId, decorationId, user.id);
  }

  @Post(':storyId/locations') createLocation(
    @Param('storyId') storyId: string,
    @Body() input: CreateLocationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createLocation(storyId, input, user.id);
  }

  @Patch(':storyId/locations/:locationId') updateLocation(
    @Param('storyId') storyId: string,
    @Param('locationId') locationId: string,
    @Body() input: UpdateLocationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateLocation(storyId, locationId, input, user.id);
  }

  @Post(':storyId/characters') createCharacter(
    @Param('storyId') storyId: string,
    @Body() input: CreateCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createCharacter(storyId, input, user.id);
  }

  @Post(':storyId/stat-definitions') createStatDefinition(
    @Param('storyId') storyId: string,
    @Body() input: CreateStatDefinitionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createStatDefinition(storyId, input, user.id);
  }

  @Post(':storyId/stats') createStatAssignment(
    @Param('storyId') storyId: string,
    @Body() input: CreateStatAssignmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createStatAssignment(storyId, input, user.id);
  }

  @Patch(':storyId/stats/:statId') updateStatAssignment(
    @Param('storyId') storyId: string,
    @Param('statId') statId: string,
    @Body() input: UpdateStatAssignmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateStatAssignment(storyId, statId, input, user.id);
  }

  @Delete(':storyId/stats/:statId') deleteStatAssignment(
    @Param('storyId') storyId: string,
    @Param('statId') statId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.deleteStatAssignment(storyId, statId, user.id);
  }

  @Post(':storyId/item-definitions') createItemDefinition(
    @Param('storyId') storyId: string,
    @Body() input: CreateItemDefinitionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createItemDefinition(storyId, input, user.id);
  }

  @Patch(':storyId/item-definitions/:itemDefinitionId') updateItemDefinition(
    @Param('storyId') storyId: string,
    @Param('itemDefinitionId') itemDefinitionId: string,
    @Body() input: UpdateItemDefinitionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateItemDefinition(storyId, itemDefinitionId, input, user.id);
  }

  @Patch(':storyId/stat-definitions/:statDefinitionId') updateStatDefinition(
    @Param('storyId') storyId: string,
    @Param('statDefinitionId') statDefinitionId: string,
    @Body() input: UpdateStatDefinitionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateStatDefinition(storyId, statDefinitionId, input, user.id);
  }

  @Delete(':storyId/stat-definitions/:statDefinitionId') deleteStatDefinition(
    @Param('storyId') storyId: string,
    @Param('statDefinitionId') statDefinitionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.deleteStatDefinition(storyId, statDefinitionId, user.id);
  }

  @Patch(':storyId/characters/:characterId') updateCharacter(
    @Param('storyId') storyId: string,
    @Param('characterId') characterId: string,
    @Body() input: UpdateCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateCharacter(storyId, characterId, input, user.id);
  }

  @Post(':storyId/characters/:characterId/stats') createCharacterStat(
    @Param('storyId') storyId: string,
    @Param('characterId') characterId: string,
    @Body() input: CreateCharacterStatDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createCharacterStat(storyId, characterId, input, user.id);
  }

  @Post(':storyId/characters/:characterId/items') createCharacterItem(
    @Param('storyId') storyId: string,
    @Param('characterId') characterId: string,
    @Body() input: CreateCharacterItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.createCharacterItem(storyId, characterId, input, user.id);
  }

  @Patch(':storyId/characters/:characterId/stats/:statId') updateCharacterStat(
    @Param('storyId') storyId: string,
    @Param('characterId') characterId: string,
    @Param('statId') statId: string,
    @Body() input: UpdateCharacterStatDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateCharacterStat(storyId, characterId, statId, input, user.id);
  }

  @Delete(':storyId/characters/:characterId/stats/:statId') deleteCharacterStat(
    @Param('storyId') storyId: string,
    @Param('characterId') characterId: string,
    @Param('statId') statId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.deleteCharacterStat(storyId, characterId, statId, user.id);
  }

  @Delete(':storyId/characters/:characterId/items/:itemId') deleteCharacterItem(
    @Param('storyId') storyId: string,
    @Param('characterId') characterId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.deleteCharacterItem(storyId, characterId, itemId, user.id);
  }

  @Patch(':storyId/items/:itemId/placement') moveItemInstance(
    @Param('storyId') storyId: string,
    @Param('itemId') itemId: string,
    @Body() input: MoveItemInstanceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.moveItemInstance(storyId, itemId, input, user.id);
  }

  @Post(':storyId/interactions/:interactionId/triggers') addTrigger(
    @Param('storyId') storyId: string,
    @Param('interactionId') interactionId: string,
    @Body() input: CreateTriggerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.addTrigger(storyId, interactionId, input, user.id);
  }

  @Patch(':storyId/interactions/:interactionId/triggers/:triggerId') updateTrigger(
    @Param('storyId') storyId: string,
    @Param('interactionId') interactionId: string,
    @Param('triggerId') triggerId: string,
    @Body() input: UpdateTriggerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.updateTrigger(storyId, interactionId, triggerId, input, user.id);
  }

  @Delete(':storyId/interactions/:interactionId/triggers/:triggerId') deleteTrigger(
    @Param('storyId') storyId: string,
    @Param('interactionId') interactionId: string,
    @Param('triggerId') triggerId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.deleteTrigger(storyId, interactionId, triggerId, user.id);
  }
}
