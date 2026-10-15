import { Inject, Injectable, Logger } from '@nestjs/common';
import { provisionDefaults, type Db } from '@finally/db';
import { ENV, type Env } from '../common/env';
import { InjectDb, type AuthUser } from '../common/tokens';

interface Claims {
  sub: string;
  email: string;
}

@Injectable()
export class UsersService {
  private readonly log = new Logger(UsersService.name);
  private readonly cache = new Map<string, { user: AuthUser; at: number }>();
  private readonly inflight = new Map<string, Promise<AuthUser>>();

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private readonly provisioned = new Set<string>();

  isAllowed(email: string): boolean {
    return this.env.ALLOWED_EMAILS.includes(email.toLowerCase());
  }

  /**
   * Map verified token claims to a database user. A user seeded before first sign-in carries
   * `authId = pending:<email>`; the first real sign-in adopts it. Defaults are provisioned idempotently.
   */
  async resolve(claims: Claims): Promise<AuthUser> {
    const hit = this.cache.get(claims.sub);
    if (hit && Date.now() - hit.at < 60_000) return hit.user;
    // The browser fires several requests at once on load; resolve the user only once for all of them.
    let pending = this.inflight.get(claims.sub);
    if (!pending) {
      pending = this.load(claims).finally(() => this.inflight.delete(claims.sub));
      this.inflight.set(claims.sub, pending);
    }
    return pending;
  }

  private async load(claims: Claims): Promise<AuthUser> {
    const email = claims.email.toLowerCase();
    let user = await this.db.user.findUnique({ where: { authId: claims.sub } });
    if (!user) {
      const byEmail = await this.db.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await this.db.user.update({ where: { id: byEmail.id }, data: { authId: claims.sub } });
        this.log.log(`Linked Supabase user to existing profile ${byEmail.id}`);
      } else {
        user = await this.db.user.create({
          data: { authId: claims.sub, email, displayName: email.split('@')[0] ?? 'Me' },
        });
        this.log.log(`Created profile ${user.id}`);
      }
      await provisionDefaults(this.db, user.id);
      this.provisioned.add(user.id);
    } else if (!this.provisioned.has(user.id)) {
      // Existing profiles pick up categories and rules added by newer versions, once per server start.
      await provisionDefaults(this.db, user.id);
      this.provisioned.add(user.id);
    }
    const authUser: AuthUser = { id: user.id, authId: claims.sub, email };
    this.cache.set(claims.sub, { user: authUser, at: Date.now() });
    return authUser;
  }

  forget(authId: string): void {
    this.cache.delete(authId);
  }
}
