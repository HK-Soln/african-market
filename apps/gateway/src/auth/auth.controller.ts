import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public, REFRESH_TOKEN_COOKIE } from '@am/auth';
import {
  AuthenticatedUserResponse,
  EmailCodeResponse,
  IdentityErrors,
  IdentityPatterns,
  LogoutResponse,
  RequestOtpResponse,
  SessionTokens,
  UserDto,
  VerifyOtpResponse,
} from '@am/contracts';
import { APP_ENV } from '@am/core';
import { correlationId, requestLocale, requestOrigin } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';
import type { GatewayEnv } from '../env';
import { clearAuthCookies, setAuthCookies } from './auth-cookies';
import { AuthThrottles } from './auth.throttles';
import {
  AuthSessionDto,
  EmailCodeSentDto,
  EmailDto,
  LoggedOutDto,
  LoginDto,
  OtpRequestedDto,
  RegisterDto,
  RequestOtpDto,
  ResetPasswordDto,
  VerifyEmailDto,
  VerifyOtpDto,
} from './dto/auth.dto';

/**
 * Sign-up, sign-in and sessions. Every route is open (there is no session yet, or it has
 * expired); the identity service decides who gets in.
 */
@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly caller: ServiceCaller,
    @Inject(APP_ENV) private readonly env: GatewayEnv,
  ) {}

  @ApiOperation({ summary: 'Send a sign-in code to a phone (WhatsApp by default)' })
  @ApiOkResponse({ type: OtpRequestedDto })
  @Throttle(AuthThrottles.codeRequest)
  @HttpCode(200)
  @Post('otp/request')
  requestOtp(@Body() body: RequestOtpDto, @Req() req: Request): Promise<OtpRequestedDto> {
    return this.identity<RequestOtpResponse>(IdentityPatterns.requestOtp, {
      ...body,
      locale: requestLocale(req),
      ip: req.ip,
    });
  }

  @ApiOperation({ summary: 'Check the code; signs in, creating the account if the phone is new' })
  @ApiOkResponse({ type: AuthSessionDto })
  @Throttle(AuthThrottles.codeVerify)
  @HttpCode(200)
  @Post('otp/verify')
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionDto> {
    const result = await this.identity<VerifyOtpResponse>(IdentityPatterns.verifyOtp, {
      ...body,
      preferredLanguage: body.preferredLanguage ?? requestLocale(req),
      correlationId: correlationId(req),
      ...requestOrigin(req),
    });
    return this.signedIn(res, result.user, result.session, result.isNewUser);
  }

  @ApiOperation({ summary: 'Register with email and password; emails a verification code' })
  @ApiOkResponse({ type: EmailCodeSentDto })
  @Throttle(AuthThrottles.codeRequest)
  @HttpCode(200)
  @Post('register')
  register(@Body() body: RegisterDto, @Req() req: Request): Promise<EmailCodeSentDto> {
    return this.identity<EmailCodeResponse>(IdentityPatterns.registerWithEmail, {
      ...body,
      preferredLanguage: body.preferredLanguage ?? requestLocale(req),
      locale: requestLocale(req),
      ip: req.ip,
    });
  }

  @ApiOperation({ summary: 'Send the email verification code again' })
  @ApiOkResponse({ type: EmailCodeSentDto })
  @Throttle(AuthThrottles.codeRequest)
  @HttpCode(200)
  @Post('email/resend')
  resendEmailCode(@Body() body: EmailDto, @Req() req: Request): Promise<EmailCodeSentDto> {
    return this.identity<EmailCodeResponse>(IdentityPatterns.resendEmailCode, {
      ...body,
      locale: requestLocale(req),
      ip: req.ip,
    });
  }

  @ApiOperation({ summary: 'Confirm the email address with the code; signs in' })
  @ApiOkResponse({ type: AuthSessionDto })
  @Throttle(AuthThrottles.codeVerify)
  @HttpCode(200)
  @Post('email/verify')
  async verifyEmail(
    @Body() body: VerifyEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionDto> {
    const result = await this.identity<VerifyOtpResponse>(IdentityPatterns.verifyEmail, {
      ...body,
      correlationId: correlationId(req),
      ...requestOrigin(req),
    });
    return this.signedIn(res, result.user, result.session, result.isNewUser);
  }

  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiOkResponse({ type: AuthSessionDto })
  @Throttle(AuthThrottles.login)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionDto> {
    const result = await this.identity<AuthenticatedUserResponse>(
      IdentityPatterns.loginWithPassword,
      { ...body, ...requestOrigin(req) },
    );
    return this.signedIn(res, result.user, result.session);
  }

  @ApiOperation({ summary: 'Email a password reset code' })
  @ApiOkResponse({ type: EmailCodeSentDto })
  @Throttle(AuthThrottles.codeRequest)
  @HttpCode(200)
  @Post('password/forgot')
  forgotPassword(@Body() body: EmailDto, @Req() req: Request): Promise<EmailCodeSentDto> {
    return this.identity<EmailCodeResponse>(IdentityPatterns.requestPasswordReset, {
      ...body,
      locale: requestLocale(req),
      ip: req.ip,
    });
  }

  @ApiOperation({ summary: 'Set a new password with the emailed code; signs in' })
  @ApiOkResponse({ type: AuthSessionDto })
  @Throttle(AuthThrottles.codeVerify)
  @HttpCode(200)
  @Post('password/reset')
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionDto> {
    const result = await this.identity<AuthenticatedUserResponse>(IdentityPatterns.resetPassword, {
      ...body,
      ...requestOrigin(req),
    });
    return this.signedIn(res, result.user, result.session);
  }

  @ApiOperation({ summary: 'Swap the refresh cookie for a new access and refresh token' })
  @ApiOkResponse({ type: AuthSessionDto })
  @Throttle(AuthThrottles.refresh)
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionDto> {
    const refreshToken = this.refreshCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: IdentityErrors.sessionInvalid,
        message: 'The session has ended; sign in again',
      });
    }
    try {
      const result = await this.identity<AuthenticatedUserResponse>(
        IdentityPatterns.refreshSession,
        { refreshToken, ...requestOrigin(req) },
      );
      return this.signedIn(res, result.user, result.session);
    } catch (err) {
      // A refused token will never work again, so stop the browser sending it. An outage is
      // different: the session is still good and the cookies stay.
      if (err instanceof HttpException && [401, 403].includes(err.getStatus())) {
        clearAuthCookies(res, this.env);
      }
      throw err;
    }
  }

  @ApiOperation({ summary: 'Sign out on this device' })
  @ApiOkResponse({ type: LoggedOutDto })
  @HttpCode(200)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoggedOutDto> {
    const refreshToken = this.refreshCookie(req);
    // The cookies go first: the person is signed out here even if identity cannot be reached.
    clearAuthCookies(res, this.env);
    if (refreshToken) {
      await this.identity<LogoutResponse>(IdentityPatterns.logout, { refreshToken });
    }
    return { loggedOut: true };
  }

  private identity<TResult>(pattern: string, data: unknown): Promise<TResult> {
    return this.caller.call<TResult>('identity', pattern, data);
  }

  private refreshCookie(req: Request): string | undefined {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_TOKEN_COOKIE];
    return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : undefined;
  }

  private signedIn(
    res: Response,
    user: UserDto,
    session: SessionTokens,
    isNewUser = false,
  ): AuthSessionDto {
    setAuthCookies(res, session, this.env);
    return {
      user,
      isNewUser,
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
    };
  }
}
