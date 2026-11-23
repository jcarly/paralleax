import { STORY_CHANGE_BATCH_LIMITS, STORY_CHANGE_BATCH_VERSION } from '@paralleax/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';

/*
 * Envelope of a change batch (ADR-050). Each operation is checked by the batch
 * validation with per-operation diagnostics, then by the single-edit DTOs.
 */
export class PreviewStoryChangesDto {
  @IsIn([STORY_CHANGE_BATCH_VERSION])
  version!: typeof STORY_CHANGE_BATCH_VERSION;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseRevision?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(STORY_CHANGE_BATCH_LIMITS.operations)
  @IsObject({ each: true })
  operations!: Record<string, unknown>[];
}

/** A commit names a stored preview; the operations come from the server. */
export class CommitStoryChangesDto {
  @IsIn([STORY_CHANGE_BATCH_VERSION])
  version!: typeof STORY_CHANGE_BATCH_VERSION;

  @Matches(/^[0-9a-f]{64}$/)
  proposalId!: string;
}
