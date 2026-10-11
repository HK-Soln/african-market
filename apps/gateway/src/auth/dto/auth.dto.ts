import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Shape only. The identity service checks formats and answers with a specific code
// (PHONE_INVALID, EMAIL_INVALID, PASSWORD_TOO_SHORT, ...) that the screens translate.

const LANGUAGES = ['en', 'ar', 'fr'];

export class RequestOtpDto {
  @ApiProperty({ example: '+971501234567', description: 'Any format; UAE is assumed without +.' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional({ enum: ['whatsapp', 'sms'], default: 'whatsapp' })
  @IsOptional()
  @IsIn(['whatsapp', 'sms'])
  channel?: 'whatsapp' | 'sms';
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+971501234567' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone!: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  code!: string;

  @ApiPropertyOptional({ description: 'Must be true when this creates the account.' })
  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  preferredLanguage?: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'amina@example.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ description: 'Must be true.' })
  @IsBoolean()
  termsAccepted!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  preferredLanguage?: string;
}

export class EmailDto {
  @ApiProperty({ example: 'amina@example.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  email!: string;
}

export class VerifyEmailDto extends EmailDto {
  @ApiProperty({ example: '482913' })
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  code!: string;

  @ApiProperty({ description: 'The password chosen at registration, sent again.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}

export class LoginDto extends EmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}

export class ResetPasswordDto extends EmailDto {
  @ApiProperty({ example: '482913' })
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  code!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  newPassword!: string;
}

// ---- Responses

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: '+971501234567' })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: LANGUAGES })
  preferredLanguage!: string;

  @ApiProperty({ enum: ['customer', 'seller', 'admin'], isArray: true })
  roles!: Array<'customer' | 'seller' | 'admin'>;

  @ApiProperty()
  phoneVerified!: boolean;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'DXB' })
  homeEmirate!: string | null;

  @ApiProperty()
  marketingConsent!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class OtpRequestedDto {
  @ApiProperty({ description: 'The phone in E.164; send this back when verifying.' })
  phone!: string;

  @ApiProperty({ enum: ['whatsapp', 'sms'] })
  channel!: 'whatsapp' | 'sms';

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ description: 'Seconds to wait before asking for another code.' })
  resendAfterSeconds!: number;
}

export class EmailCodeSentDto {
  @ApiProperty()
  email!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ description: 'Seconds to wait before asking for another code.' })
  resendAfterSeconds!: number;
}

/**
 * A successful sign-in. Both tokens are also set as httpOnly cookies; the access token is
 * repeated here for clients that cannot use cookies. The refresh token is never in the body.
 */
export class AuthSessionDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({ description: 'True when this call created the account.' })
  isNewUser!: boolean;

  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ format: 'date-time' })
  accessTokenExpiresAt!: string;
}

export class LoggedOutDto {
  @ApiProperty({ enum: [true] })
  loggedOut!: true;
}
