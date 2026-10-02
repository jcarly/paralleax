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

export class AccountEmailDto {
  @IsEmail() @MaxLength(320) email!: string;
}

export class AccountActionTokenDto {
  @IsString() @MinLength(32) @MaxLength(256) token!: string;
}

export class ResetPasswordDto extends AccountActionTokenDto {
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(8) @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
