import { Inject } from '@nestjs/common';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const PRISMA = Symbol('PRISMA');
export const InjectDb = (): ParameterDecorator => Inject(PRISMA);

export interface AuthUser {
  /** Database user id */
  id: string;
  authId: string;
  email: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used on a route without the auth guard');
  return req.user;
});
