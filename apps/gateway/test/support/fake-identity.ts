import { randomBytes, randomUUID } from 'node:crypto';
import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MessagePattern, Payload, RpcException, Transport } from '@nestjs/microservices';
import {
  AuthenticatedUserResponse,
  CountryDto,
  IdentityErrors,
  IdentityPatterns,
  IdentityTestPatterns,
  CountryPage,
  MeResponse,
  RequestOtpResponse,
  SessionTokens,
  UserDto,
  VerifyOtpResponse,
} from '@am/contracts';

/** The code the stand-in "sends" to every phone. */
export const FAKE_OTP_CODE = '482913';

type Data = Record<string, unknown>;

const fail = (status: number, code: string, details?: unknown) =>
  new RpcException({ status, code, message: code, details });

/**
 * A stand-in for the identity service that speaks the same TCP patterns and keeps its state in
 * memory. The gateway may not import another app's code, and what is under test here is the
 * gateway: routes, validation, cookies, guards and error mapping over a real TCP hop. Identity's
 * own rules are tested in apps/identity.
 */
@Controller()
export class FakeIdentityController {
  static jwt: JwtService;
  /** Every payload received, newest last, so tests can see what the gateway forwarded. */
  static readonly received: Array<{ pattern: string; data: Data }> = [];

  private readonly users = new Map<string, UserDto>();
  private readonly byPhone = new Map<string, string>();
  private readonly refreshTokens = new Map<string, string>();

  static last(pattern: string): Data {
    const found = [...this.received].reverse().find((entry) => entry.pattern === pattern);
    if (!found) throw new Error(`Nothing was sent to ${pattern}`);
    return found.data;
  }

  @MessagePattern(IdentityPatterns.requestOtp)
  requestOtp(@Payload() data: Data): RequestOtpResponse {
    this.record(IdentityPatterns.requestOtp, data);
    if (data.phone === 'not-a-phone') throw fail(400, IdentityErrors.phoneInvalid);
    return {
      phone: String(data.phone),
      channel: 'whatsapp',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      resendAfterSeconds: 30,
    };
  }

  private readonly countries: CountryDto[] = [
    {
      code: 'AE',
      name: { en: 'United Arab Emirates', ar: 'الإمارات', fr: 'Émirats arabes unis' },
      dialCode: '+971',
      flag: '🇦🇪',
      phoneEnabled: true,
      originEnabled: true,
      sortOrder: 1,
    },
    {
      code: 'FR',
      name: { en: 'France', ar: 'فرنسا', fr: 'France' },
      dialCode: '+33',
      flag: '🇫🇷',
      phoneEnabled: false,
      originEnabled: false,
      sortOrder: 1000,
    },
  ];

  @MessagePattern(IdentityPatterns.listCountries)
  listCountries(@Payload() data: Data): CountryPage {
    this.record(IdentityPatterns.listCountries, data);
    const items = this.countries.filter((c) => c.phoneEnabled || c.originEnabled);
    return { items, nextCursor: null, prevCursor: null };
  }

  @MessagePattern(IdentityPatterns.listAllCountries)
  listAllCountries(@Payload() data: Data): CountryPage {
    this.record(IdentityPatterns.listAllCountries, data);
    return { items: this.countries, nextCursor: null, prevCursor: null };
  }

  @MessagePattern(IdentityPatterns.updateCountry)
  updateCountry(@Payload() data: Data): CountryDto {
    this.record(IdentityPatterns.updateCountry, data);
    const country = this.countries.find((c) => c.code === String(data.code).toUpperCase());
    if (!country) throw fail(404, IdentityErrors.countryNotFound);
    if (typeof data.phoneEnabled === 'boolean') country.phoneEnabled = data.phoneEnabled;
    return country;
  }

  @MessagePattern(IdentityTestPatterns.lastOtp)
  lastOtp(@Payload() data: Data): { code: string | null } {
    this.record(IdentityTestPatterns.lastOtp, data);
    return { code: FAKE_OTP_CODE };
  }

  @MessagePattern(IdentityPatterns.verifyOtp)
  async verifyOtp(@Payload() data: Data): Promise<VerifyOtpResponse> {
    this.record(IdentityPatterns.verifyOtp, data);
    if (data.code !== FAKE_OTP_CODE)
      throw fail(400, IdentityErrors.otpInvalid, { attemptsLeft: 4 });
    const phone = String(data.phone);
    let userId = this.byPhone.get(phone);
    const isNewUser = !userId;
    if (!userId) {
      if (data.termsAccepted !== true) throw fail(400, IdentityErrors.termsNotAccepted);
      userId = randomUUID();
      this.byPhone.set(phone, userId);
      this.users.set(userId, {
        id: userId,
        phone,
        email: null,
        name: null,
        preferredLanguage:
          typeof data.preferredLanguage === 'string' ? data.preferredLanguage : 'en',
        roles: ['customer'],
        phoneVerified: true,
        emailVerified: false,
        homeEmirate: null,
        marketingConsent: false,
        createdAt: new Date().toISOString(),
      });
    }
    const user = this.users.get(userId) as UserDto;
    return { user, isNewUser, session: await this.issue(user) };
  }

  @MessagePattern(IdentityPatterns.refreshSession)
  async refresh(@Payload() data: Data): Promise<AuthenticatedUserResponse> {
    this.record(IdentityPatterns.refreshSession, data);
    const token = String(data.refreshToken);
    const userId = this.refreshTokens.get(token);
    if (!userId) throw fail(401, IdentityErrors.sessionInvalid);
    this.refreshTokens.delete(token);
    const user = this.users.get(userId) as UserDto;
    return { user, session: await this.issue(user) };
  }

  @MessagePattern(IdentityPatterns.logout)
  logout(@Payload() data: Data): { loggedOut: true } {
    this.record(IdentityPatterns.logout, data);
    this.refreshTokens.delete(String(data.refreshToken));
    return { loggedOut: true };
  }

  @MessagePattern(IdentityPatterns.getMe)
  getMe(@Payload() data: Data): MeResponse {
    this.record(IdentityPatterns.getMe, data);
    const user = this.users.get(String(data.userId));
    if (!user) throw fail(404, IdentityErrors.userNotFound);
    return { user, shops: [] };
  }

  @MessagePattern(IdentityPatterns.updateMe)
  updateMe(@Payload() data: Data): MeResponse {
    this.record(IdentityPatterns.updateMe, data);
    const user = this.users.get(String(data.userId));
    if (!user) throw fail(404, IdentityErrors.userNotFound);
    if (data.homeEmirate !== undefined && data.homeEmirate !== null && data.homeEmirate !== 'SHJ') {
      throw fail(400, IdentityErrors.validationFailed, {
        issues: [{ path: 'homeEmirate', message: 'Invalid value' }],
      });
    }
    if (typeof data.name === 'string') user.name = data.name;
    if (typeof data.homeEmirate === 'string') user.homeEmirate = data.homeEmirate;
    return { user, shops: [] };
  }

  private record(pattern: string, data: Data): void {
    FakeIdentityController.received.push({ pattern, data });
  }

  private async issue(user: UserDto): Promise<SessionTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    this.refreshTokens.set(refreshToken, user.id);
    return {
      accessToken: await FakeIdentityController.jwt.signAsync(
        { sub: user.id, roles: user.roles, shops: [], locale: user.preferredLanguage },
        { algorithm: 'HS256', expiresIn: 900 },
      ),
      accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
  }
}

@Module({ controllers: [FakeIdentityController] })
class FakeIdentityModule {}

/** Starts the stand-in on a TCP port, signing access tokens with the gateway's key. */
export async function startFakeIdentity(port: number, key: string): Promise<INestMicroservice> {
  FakeIdentityController.jwt = new JwtService({ secret: key });
  FakeIdentityController.received.length = 0;
  const service = await NestFactory.createMicroservice(FakeIdentityModule, {
    transport: Transport.TCP,
    options: { host: '127.0.0.1', port },
    logger: false,
  });
  await service.listen();
  return service;
}
