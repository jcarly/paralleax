import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsIn,
  IsString,
  ArrayMaxSize,
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
export class UpdateStoryDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
}
export class CreateInteractionDto {
  @ValidateIf((_, value) => value !== undefined) @IsString() parentId?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}
export class UpdateInteractionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
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
}
export class StatEffectDto {
  @IsString() statId!: string;
  @IsIn(['add', 'set']) operation!: 'add' | 'set';
  @IsNumber() value!: number;
}
export class TriggerConditionDto {
  @ValidateIf(
    (condition) =>
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined,
  )
  @IsString()
  interactionId?: string;
  @ValidateIf(
    (condition) =>
      condition.locationId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined,
  )
  @IsBoolean()
  hasBeenVisited?: boolean;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined,
  )
  @IsString()
  locationId?: string;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.characterId === undefined &&
      condition.statId === undefined,
  )
  @IsBoolean()
  isCurrentLocation?: boolean;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.statId === undefined,
  )
  @IsString()
  characterId?: string;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.statId === undefined,
  )
  @IsBoolean()
  isPresent?: boolean;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined,
  )
  @IsString()
  statId?: string;
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined,
  )
  @IsIn(['eq', 'lt', 'lte', 'gt', 'gte'])
  operator?: 'eq' | 'lt' | 'lte' | 'gt' | 'gte';
  @ValidateIf(
    (condition) =>
      condition.interactionId === undefined &&
      condition.locationId === undefined &&
      condition.characterId === undefined,
  )
  @IsNumber()
  value?: number;
}
export class CreateLocationDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
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
}
export class CreateCharacterDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
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
}
export class CreateCharacterStatDto {
  @IsString() @IsNotEmpty() statDefinitionId!: string;
  @IsNumber() initialValue!: number;
}
export class UpdateCharacterStatDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  initialValue?: number;
}
export class CreateStatDefinitionDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
}
export class UpdateStatDefinitionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
}
export class CreateItemDefinitionDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
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
}
export class CreateCharacterItemDto {
  @IsString() @IsNotEmpty() itemDefinitionId!: string;
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
}
export class UpdateTriggerDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  inputInteractionIds!: string[];
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TriggerConditionDto)
  conditions!: TriggerConditionDto[];
}
