import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  CreateInteractionDto,
  CreateLocationDto,
  CreateStoryDto,
  CreateTriggerDto,
  UpdateInteractionDto,
  UpdateLocationDto,
  UpdateStoryDto,
  UpdateTriggerDto,
} from './dto/stories.dto';
import { StoriesService } from './stories.service';
import { CurrentUser, type RequestUser } from '../auth/auth.decorators';
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
