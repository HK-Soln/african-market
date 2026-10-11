import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { AuthenticatedUserResponse, IdentityPatterns, LogoutResponse } from '@am/contracts';
import { fields, parsePayload } from '../validation';
import { SessionService } from './session.service';

const refreshSchema = z.object({
  refreshToken: fields.refreshToken,
  ip: fields.ip,
  userAgent: fields.userAgent,
});

const logoutSchema = z.object({ refreshToken: fields.refreshToken });

@Controller()
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @MessagePattern(IdentityPatterns.refreshSession)
  refresh(@Payload() payload: unknown): Promise<AuthenticatedUserResponse> {
    return this.sessions.refresh(parsePayload(refreshSchema, payload));
  }

  @MessagePattern(IdentityPatterns.logout)
  logout(@Payload() payload: unknown): Promise<LogoutResponse> {
    return this.sessions.logout(parsePayload(logoutSchema, payload));
  }
}
