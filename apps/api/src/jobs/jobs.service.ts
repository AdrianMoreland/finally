import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ENV, type Env } from '../common/env';

export type JobName =
  | 'sync-user'
  | 'categorise'
  | 'insights'
  | 'prices'
  | 'flush-notifications'
  | 'notify-digest'
  | 'weekly-digest';

export interface JobData {
  userId?: string;
  [key: string]: unknown;
}

export type JobHandler = (data: JobData) => Promise<void>;

/**
 * Durable background work on pg-boss. Services register handlers with `register`; `enqueue` puts work on the
 * queue. With DISABLE_JOBS (e2e tests, one-off scripts) handlers run inline so the pipeline is deterministic.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(JobsService.name);
  private readonly handlers = new Map<JobName, JobHandler>();
  private boss: PgBoss | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  register(name: JobName, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  get inline(): boolean {
    return this.env.DISABLE_JOBS || !this.boss;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.DISABLE_JOBS) return;
    const connectionString = this.env.DIRECT_URL ?? this.env.DATABASE_URL;
    const ssl = this.env.DATABASE_SSL ?? (this.env.NODE_ENV === 'production' ? 'verify' : 'require');
    this.boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      max: 4,
      ssl: ssl === 'off' ? false : ssl === 'require' ? { rejectUnauthorized: false } : true,
    });
    this.boss.on('error', (err: Error) => this.log.error(`pg-boss: ${err.message}`));
    try {
      await this.boss.start();
      for (const [name, handler] of this.handlers) {
        await this.boss.createQueue(name);
        await this.boss.work<JobData>(name, { batchSize: 1 }, async (jobs) => {
          for (const job of jobs) {
            try {
              await handler(job.data ?? {});
            } catch (err) {
              this.log.error(`Job ${name} failed: ${(err as Error).message}`);
              throw err;
            }
          }
        });
      }
      this.log.log(`pg-boss started with ${this.handlers.size} queues`);
    } catch (err) {
      // Never take the API down because the queue is unavailable: fall back to inline execution.
      this.log.error(`pg-boss failed to start, running jobs inline: ${(err as Error).message}`);
      this.boss = null;
    }
  }

  /** Queue a job, or run it inline when the queue is disabled. Duplicate keys collapse into one job. */
  async enqueue(name: JobName, data: JobData = {}, singletonKey?: string): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler registered for job "${name}"`);
    if (this.inline || !this.boss) {
      await handler(data);
      return;
    }
    await this.boss.send(name, data, {
      retryLimit: 2,
      retryDelay: 30,
      ...(singletonKey ? { singletonKey, singletonSeconds: 20 } : {}),
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.boss) await this.boss.stop({ graceful: true, timeout: 5000 }).catch(() => undefined);
  }
}
