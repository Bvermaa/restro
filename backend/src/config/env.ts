import { z } from 'zod';

export const backendEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be configured'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  CLIENT_URL: z.string().default('http://localhost:3000'),
});

export function validateEnv(): z.infer<typeof backendEnvSchema> {
  const result = backendEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    console.warn(`⚠️ Backend environment validation warning: ${issues}`);
  }
  return result.data ?? (process.env as any);
}
