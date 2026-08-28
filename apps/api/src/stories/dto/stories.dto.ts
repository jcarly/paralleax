import { Type } from 'class-transformer';
import {
  MAX_GRAPH_DECORATION_TEXT_LENGTH,
  MAX_GRAPH_TEXT_SIZE,
  MAX_INTERACTION_BODY_LENGTH,
  MAX_READER_SAVE_NAME_LENGTH,
  ITEM_RELATIONSHIP_TYPES,
  MIN_GRAPH_FRAME_HEIGHT,
  MIN_GRAPH_FRAME_WIDTH,
  MIN_GRAPH_TEXT_SIZE,
} from '@paralleax/shared';
import type {
  StoryCommentPolicy,
  StoryCollaboratorRole,
  StoryEditPolicy,
  ItemRelationshipType,
  StoryVisibility,
} from '@paralleax/shared';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Min,
  Max,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class PositionDto {
  @IsNumber() x!: number;
  @IsNumber() y!: number;
}
export class CreateStoryDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
}
export class ChoiceScriptSourceFileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(260)
  @Matches(/^[^\\/]+\.txt$/i)
  name!: string;

  @IsString()
  @MaxLength(65_536)
  content!: string;
}
export class ImportChoiceScriptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChoiceScriptSourceFileDto)
  files!: ChoiceScriptSourceFileDto[];
}
export class UpdateStoryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/)
  startDateTime?: string;
}
export class UpdateStoryAccessDto {
  @IsIn(['private', 'authenticated', 'public', 'invitation'])
  visibility!: StoryVisibility;
  @IsIn(['owner', 'collaborators', 'authenticated'])
  editPolicy!: StoryEditPolicy;
  @IsIn(['editors', 'readers'])
  commentPolicy!: StoryCommentPolicy;
}
export class SetStoryCollaboratorDto {
  @IsString() @IsNotEmpty() @MaxLength(320) email!: string;
  @IsIn(['viewer', 'editor']) role!: StoryCollaboratorRole;
}
export class SaveReaderProgressDto {
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  journeyInteractionIds!: string[];
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(5_000)
  @IsString({ each: true })
  ownedItemIds?: string[];
}
export class CreateReaderSaveDto extends SaveReaderProgressDto {
  @IsString() @IsNotEmpty() @MaxLength(MAX_READER_SAVE_NAME_LENGTH) name!: string;
}
export class UpdateReaderSaveDto extends CreateReaderSaveDto {}
export class CreateInteractionDto {
  @ValidateIf((_, value) => value !== undefined) @IsString() parentId?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}
export class CreateGraphDecorationDto {
  @IsIn(['frame', 'text']) kind!: 'frame' | 'text';
  @IsObject()
  @ValidateNested()
  @Type(() => PositionDto)
  position!: PositionDto;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(MIN_GRAPH_FRAME_WIDTH)
  width?: number;
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(MIN_GRAPH_FRAME_HEIGHT)
  height?: number;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(MAX_GRAPH_DECORATION_TEXT_LENGTH)
  text?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(MIN_GRAPH_TEXT_SIZE)
  @Max(MAX_GRAPH_TEXT_SIZE)
  fontSize?: number;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['sans', 'serif', 'monospace', 'display'])
  fontFamily?: 'sans' | 'serif' | 'monospace' | 'display';
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['normal', 'bold'])
  fontWeight?: 'normal' | 'bold';
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['normal', 'italic'])
  fontStyle?: 'normal' | 'italic';
}
export class UpdateGraphDecorationDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(MIN_GRAPH_FRAME_WIDTH)
  width?: number;
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(MIN_GRAPH_FRAME_HEIGHT)
  height?: number;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(MAX_GRAPH_DECORATION_TEXT_LENGTH)
  text?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(MIN_GRAPH_TEXT_SIZE)
  @Max(MAX_GRAPH_TEXT_SIZE)
  fontSize?: number;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['sans', 'serif', 'monospace', 'display'])
  fontFamily?: 'sans' | 'serif' | 'monospace' | 'display';
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['normal', 'bold'])
  fontWeight?: 'normal' | 'bold';
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['normal', 'italic'])
  fontStyle?: 'normal' | 'italic';
}
export class UpdateInteractionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(MAX_INTERACTION_BODY_LENGTH)
  body?: string | null;
  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  locationId?: string | null;
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  characterIds?: string[];
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StatEffectDto)
  statEffects?: StatEffectDto[];
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ItemEffectDto)
  itemEffects?: ItemEffectDto[];
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  durationMinutes?: number;
}
export class StatEffectDto {
  @IsString() statId!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  itemId?: string;
  @IsIn(['add', 'set']) operation!: 'add' | 'set';
  @IsDefined() value!: unknown;
}
export class ItemEffectDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  itemId?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  itemDefinitionId?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  characterId?: string;
  @IsIn(['obtain', 'lose']) operation!: 'obtain' | 'lose';
}
export class DateRangeDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
}
export class TimeSlotDto {
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
}
export class TemporalSpecDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(366)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  dates?: string[];
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DateRangeDto)
  dateRanges?: DateRangeDto[];
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], {
    each: true,
  })
  weekdays?: Array<
    'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  >;
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(48)
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  timeSlots?: TimeSlotDto[];
}
export class TriggerConditionDto {
  @ValidateIf(
    (condition) =>
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsString()
  interactionId?: string;
  @ValidateIf(
    (condition) =>
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsBoolean()
  hasBeenVisited?: boolean;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsString()
  locationId?: string;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsBoolean()
  isCurrentLocation?: boolean;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.statId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsString()
  characterId?: string;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.statId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsBoolean()
  isPresent?: boolean;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsString()
  statId?: string;
  @ValidateIf((condition, value) => condition.statId !== undefined && value !== undefined)
  @IsString()
  itemId?: string;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsIn(['eq', 'neq', 'lt', 'lte', 'gt', 'gte'])
  operator?: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.itemDefinitionId === undefined &&
      condition.temporal === undefined,
  )
  @IsDefined()
  value?: unknown;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined &&
      condition.temporal === undefined,
  )
  @IsString()
  itemDefinitionId?: string;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined &&
      condition.temporal === undefined,
  )
  @IsBoolean()
  isOwned?: boolean;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined &&
      condition.itemDefinitionId === undefined,
  )
  @IsObject()
  @ValidateNested()
  @Type(() => TemporalSpecDto)
  temporal?: TemporalSpecDto;
}
export class CreateLocationDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
}
export class UpdateLocationDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
}
export class CreateCharacterDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isPlayable?: boolean;
}
export class UpdateCharacterDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isPlayable?: boolean;
}
export class CreateCharacterStatDto {
  @IsString() @IsNotEmpty() statDefinitionId!: string;
  @IsDefined() initialValue!: unknown;
}
export class UpdateCharacterStatDto {
  @IsDefined() initialValue!: unknown;
}
export class CreateStatDefinitionDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['number', 'boolean', 'string'])
  valueType?: 'number' | 'boolean' | 'string';
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  changePerHour?: number;
}
export class UpdateStatDefinitionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  changePerHour?: number;
}
export class CreateStatAssignmentDto {
  @IsString() @IsNotEmpty() statDefinitionId!: string;
  @IsIn(['story', 'character', 'location', 'itemDefinition'])
  ownerType!: 'story' | 'character' | 'location' | 'itemDefinition';
  @ValidateIf((input) => input.ownerType !== 'story')
  @IsString()
  @IsNotEmpty()
  ownerId?: string;
  @IsDefined() initialValue!: unknown;
}
export class UpdateStatAssignmentDto {
  @IsDefined() initialValue!: unknown;
}
export class CreateItemDefinitionDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ItemDefinitionStatDto)
  stats?: ItemDefinitionStatDto[];
}
export class UpdateItemDefinitionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ItemDefinitionStatDto)
  stats?: ItemDefinitionStatDto[];
}
export class ItemDefinitionStatDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  id?: string;
  @IsString() @IsNotEmpty() statDefinitionId!: string;
  @IsDefined() initialValue!: unknown;
}
export class CreateCharacterItemDto {
  @IsString() @IsNotEmpty() itemDefinitionId!: string;
}
export class MoveItemInstanceDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  characterId?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  locationId?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  parentItemId?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(ITEM_RELATIONSHIP_TYPES)
  relationshipType?: ItemRelationshipType;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  slotKey?: string;
}
export class CreateTriggerDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  inputInteractionIds?: string[];
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TriggerConditionDto)
  conditions?: TriggerConditionDto[];
  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}
export class UpdateTriggerDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  inputInteractionIds?: string[];
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TriggerConditionDto)
  conditions?: TriggerConditionDto[];
  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}
