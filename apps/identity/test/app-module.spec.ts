import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailAuthService } from '../src/email-auth/email-auth.service';
import { OtpService } from '../src/otp/otp.service';
import { SessionService } from '../src/sessions/session.service';
import { UsersService } from '../src/users/users.service';

/**
 * Builds the real module graph. The other tests construct services by hand, so only this one
 * notices a provider that Nest cannot resolve, which would otherwise show up as a crash at boot.
 */
describe('identity AppModule', () => {
  it('resolves every provider', async () => {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
      expect(app.get(OtpService)).toBeInstanceOf(OtpService);
      expect(app.get(EmailAuthService)).toBeInstanceOf(EmailAuthService);
      expect(app.get(SessionService)).toBeInstanceOf(SessionService);
      expect(app.get(UsersService)).toBeInstanceOf(UsersService);
    } finally {
      await app.close();
    }
  }, 30_000);
});
