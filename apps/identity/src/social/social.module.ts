import { Controller, Module } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import {
  IdentityPatterns,
  SOCIAL_PROVIDERS,
  SocialProvidersResponse,
  VerifyOtpResponse,
} from '@am/contracts';
import { APP_ENV } from '@am/core';
import { OutboxService } from '@am/database';
import type { IdentityEnv } from '../config/identity-env';
import { SessionService } from '../sessions/session.service';
import { fields, parsePayload } from '../validation';
import {
  FacebookVerifier,
  FakeSocialVerifier,
  GoogleVerifier,
  SOCIAL_VERIFIERS,
  SocialVerifier,
} from './social-verifier';
import { SocialService } from './social.service';

const signInSchema = z.object({
  provider: z.enum(SOCIAL_PROVIDERS),
  // A Google ID token runs to a couple of kilobytes; a Facebook token is shorter.
  token: z.string().min(10).max(8192),
  termsAccepted: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  preferredLanguage: fields.locale,
  ip: fields.ip,
  userAgent: fields.userAgent,
  correlationId: fields.correlationId,
});

@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @MessagePattern(IdentityPatterns.socialSignIn)
  signIn(@Payload() payload: unknown): Promise<VerifyOtpResponse> {
    return this.social.signIn(parsePayload(signInSchema, payload));
  }

  @MessagePattern(IdentityPatterns.socialProviders)
  providers(): SocialProvidersResponse {
    return this.social.providers();
  }
}

/** The providers switched on (SOCIAL_PROVIDERS); with FAKE_SOCIAL_SIGN_IN, fakes stand in for them. */
function verifiersFor(env: IdentityEnv): SocialVerifier[] {
  return env.SOCIAL_PROVIDERS.map((provider) => {
    if (env.FAKE_SOCIAL_SIGN_IN) return new FakeSocialVerifier(provider);
    return provider === 'google'
      ? new GoogleVerifier(env.GOOGLE_CLIENT_IDS)
      : new FacebookVerifier(env.FACEBOOK_APP_ID!, env.FACEBOOK_APP_SECRET!);
  });
}

@Module({
  controllers: [SocialController],
  providers: [
    { provide: SOCIAL_VERIFIERS, inject: [APP_ENV], useFactory: verifiersFor },
    {
      provide: SocialService,
      inject: [getDataSourceToken(), OutboxService, SessionService, SOCIAL_VERIFIERS, APP_ENV],
      useFactory: (
        dataSource: DataSource,
        outbox: OutboxService,
        sessions: SessionService,
        verifiers: SocialVerifier[],
        env: IdentityEnv,
      ) =>
        new SocialService(dataSource, outbox, sessions, verifiers, {
          // The apps' buttons use the first id (one Google client can list the web and seller
          // origins); the others are only accepted, for clients added later.
          googleClientId: env.GOOGLE_CLIENT_IDS[0],
          facebookAppId: env.FACEBOOK_APP_ID,
        }),
    },
  ],
})
export class SocialModule {}
