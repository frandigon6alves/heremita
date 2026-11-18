import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginAttempts } from './login-attempts.js';
import { SessionCookies } from './session-cookies.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';

/**
 * Accounts and sessions. Exports what the session guard (registered globally in
 * `AppModule`) and the account endpoints (password change, deletion) need.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, LoginAttempts, SessionService, SessionCookies, SessionGuard],
  exports: [SessionService, SessionCookies, SessionGuard],
})
export class AuthModule {}
