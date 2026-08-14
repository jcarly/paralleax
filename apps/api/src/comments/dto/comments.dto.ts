import { IsIn, IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import type { CommentAnchor } from '@paralleax/shared';

export class CreateCommentThreadDto {
  @IsObject()
  anchor!: CommentAnchor;

  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  body!: string;
}

export class AddCommentMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  body!: string;
}

export class UpdateCommentThreadStatusDto {
  @IsIn(['open', 'resolved'])
  status!: 'open' | 'resolved';
}

export class UpdateCommentThreadAnchorDto {
  @IsObject()
  anchor!: CommentAnchor;
}
