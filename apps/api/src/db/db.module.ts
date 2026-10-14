import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClient, type Db } from '@finally/db';
import { ENV, loadEnv, type Env } from '../common/env';
import { PRISMA } from '../common/tokens';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: (): Env => loadEnv() },
    {
      provide: PRISMA,
      inject: [ENV],
      useFactory: (env: Env): Db => createPrismaClient(env.DATABASE_URL, env.DATABASE_SSL),
    },
  ],
  exports: [ENV, PRISMA],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly db: Db) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.$disconnect();
  }
}
