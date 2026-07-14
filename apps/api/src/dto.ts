import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PositionDto {
  @IsNumber() x!: number;
  @IsNumber() y!: number;
}
export class CreateStoryDto {
  @IsOptional() @IsString() title?: string;
}
export class UpdateStoryDto {
  @IsString() title!: string;
}
export class CreateInteractionDto {
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @ValidateNested() @Type(() => PositionDto) position?: PositionDto;
}
export class UpdateInteractionDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @ValidateNested() @Type(() => PositionDto) position?: PositionDto;
}
export class TriggerConditionDto {
  @IsString() interactionId!: string;
  @IsBoolean() hasBeenVisited!: boolean;
}
export class UpdateTriggerDto {
  @IsArray() @IsString({ each: true }) inputInteractionIds!: string[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TriggerConditionDto)
  conditions!: TriggerConditionDto[];
}
