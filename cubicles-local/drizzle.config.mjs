import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema.mjs',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://cubicles:cubicles@127.0.0.1:5432/cubicles',
  },
  strict: true,
  verbose: true,
});
