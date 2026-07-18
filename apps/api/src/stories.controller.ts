import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  CreateInteractionDto,
  CreateStoryDto,
  UpdateInteractionDto,
  UpdateStoryDto,
  UpdateTriggerDto,
} from './dto';
import { StoriesService } from './stories.service';
import { CurrentUser, type RequestUser } from './auth';
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get() list(@CurrentUser() user: RequestUser) {
    return this.stories.list(user.id);
  }

  @Post() create(@Body() input: CreateStoryDto, @CurrentUser() user: RequestUser) {
    return this.stories.create(input, user.id);
  }

  @Post('demo')
  createDemo(@CurrentUser() user: RequestUser) {
    return this.stories.createDemo(user.id);
  }

  @Get(':storyId') get(@Param('storyId') id: string, @CurrentUser() user: RequestUser) {
    return this.stories.get(id, user.id);
  }

  @Patch(':storyId') rename(
    @Param('storyId') id: string,
    @Body() input: UpdateStoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.rename(id, input.title, user.id);
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

  @Post(':storyId/interactions/:interactionId/triggers') addTrigger(
    @Param('storyId') storyId: string,
    @Param('interactionId') interactionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stories.addTrigger(storyId, interactionId, user.id);
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
