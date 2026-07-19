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
}
export class TriggerConditionDto {
  @IsString() interactionId!: string;
  @IsBoolean() hasBeenVisited!: boolean;
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
