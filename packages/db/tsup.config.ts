import { defineConfig } from 'tsup';
import { tsupBase } from '@finally/config/tsup';

export default defineConfig({
  ...tsupBase,
  shims: true, // the generated client uses import.meta.url
  external: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
});
