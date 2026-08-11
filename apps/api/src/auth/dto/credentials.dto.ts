import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CredentialsDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}

export class RegisterDto extends CredentialsDto {
  @IsOptional() @IsString() @MaxLength(128) accessCode?: string;
}
