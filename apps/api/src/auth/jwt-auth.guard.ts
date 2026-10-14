import {
  CanActivate,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { IS_PUBLIC } from '../common/public.decorator';
import { ENV, type Env } from '../common/env';
import type { AuthUser } from '../common/tokens';
import { OnboardingService } from './onboarding.service';
import { UsersService } from './users.service';

/**
 * Verifies the Supabase access token against the project JWKS, checks the email against ALLOWED_EMAILS,
 * resolves the database user and attaches it as `req.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
    private readonly onboarding: OnboardingService,
    @Inject(ENV) env: Env,
  ) {
    this.jwks = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL), { cooldownDuration: 30_000 });
    this.issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const header = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let sub: string;
    let email: string | undefined;
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer, audience: 'authenticated' });
      sub = String(payload.sub);
      email = typeof payload['email'] === 'string' ? payload['email'] : undefined;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!email) throw new UnauthorizedException('Token has no email');
    if (!this.users.isAllowed(email)) throw new ForbiddenException('This account is not allowed');

    const user = await this.users.resolve({ sub, email });
    await this.onboarding.ensureOnboarded(user.id);
    req.user = user;
    return true;
  }
}
