import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
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
}
export class TriggerConditionDto {
  @ValidateIf(
    (condition) => condition.locationId === undefined && condition.characterId === undefined,
  )
  @IsString()
  interactionId?: string;
  @ValidateIf(
    (condition) => condition.locationId === undefined && condition.characterId === undefined,
  )
  @IsBoolean()
  hasBeenVisited?: boolean;
  @ValidateIf(
    (condition) => condition.interactionId === undefined && condition.characterId === undefined,
  )
  @IsString()
  locationId?: string;
  @ValidateIf(
    (condition) => condition.interactionId === undefined && condition.characterId === undefined,
  )
  @IsBoolean()
  isCurrentLocation?: boolean;
  @ValidateIf(
    (condition) => condition.interactionId === undefined && condition.locationId === undefined,
  )
  @IsString()
  characterId?: string;
  @ValidateIf(
    (condition) => condition.interactionId === undefined && condition.locationId === undefined,
  )
  @IsBoolean()
  isPresent?: boolean;
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
