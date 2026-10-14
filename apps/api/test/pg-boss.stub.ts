/** pg-boss is ESM-only and unused when DISABLE_JOBS=true; Jest's CommonJS runtime gets this stub instead. */
export class PgBoss {
  constructor() {
    throw new Error('pg-boss is stubbed in tests; set DISABLE_JOBS=true');
  }
}
