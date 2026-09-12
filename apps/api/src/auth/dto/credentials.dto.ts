import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CredentialsDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}

export class RegisterDto extends CredentialsDto {
  @IsString() @MinLength(2) @MaxLength(50) displayName!: string;
  @IsOptional() @IsString() @MaxLength(128) accessCode?: string;
}

export class UpdateDisplayNameDto {
  @IsString() @MinLength(2) @MaxLength(50) displayName!: string;
}
