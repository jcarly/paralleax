import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CreateInteractionDto, CreateStoryDto, UpdateInteractionDto, UpdateStoryDto, UpdateTriggerDto } from './dto';
import { StoriesService } from './stories.service';
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}
  @Get() list() { return this.stories.list(); }
  @Get(':storyId') get(@Param('storyId') id: string) { return this.stories.get(id); }
  @Post() create(@Body() input: CreateStoryDto) { return this.stories.create(input); }
  @Patch(':storyId') rename(@Param('storyId') id: string, @Body() input: UpdateStoryDto) { return this.stories.rename(id, input.title); }
  @Delete(':storyId') @HttpCode(204) delete(@Param('storyId') id: string) { this.stories.delete(id); }
  @Post(':storyId/interactions') createInteraction(@Param('storyId') id: string, @Body() input: CreateInteractionDto) { return this.stories.createInteraction(id, input); }
  @Patch(':storyId/interactions/:interactionId') updateInteraction(@Param('storyId') storyId: string, @Param('interactionId') interactionId: string, @Body() input: UpdateInteractionDto) { return this.stories.updateInteraction(storyId, interactionId, input); }
  @Delete(':storyId/interactions/:interactionId') deleteInteraction(@Param('storyId') storyId: string, @Param('interactionId') interactionId: string) { return this.stories.deleteInteraction(storyId, interactionId); }
  @Post(':storyId/interactions/:interactionId/triggers') addTrigger(@Param('storyId') storyId: string, @Param('interactionId') interactionId: string) { return this.stories.addTrigger(storyId, interactionId); }
  @Patch(':storyId/interactions/:interactionId/triggers/:triggerId') updateTrigger(@Param('storyId') storyId: string, @Param('interactionId') interactionId: string, @Param('triggerId') triggerId: string, @Body() input: UpdateTriggerDto) { return this.stories.updateTrigger(storyId, interactionId, triggerId, input); }
}
