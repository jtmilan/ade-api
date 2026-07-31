import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("0.0.0.0"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  PUBLIC_APP_URL: z.string().default("http://localhost:8080"),
  CHECKOUT_SUCCESS_URL: z.string().optional(),
  CHECKOUT_CANCEL_URL: z.string().optional(),
  ENTITLEMENTS_SIGNING_SECRET: z.string().default("dev-only-change-me"),
  ALLOW_DEV_AUTH: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(env);
}
