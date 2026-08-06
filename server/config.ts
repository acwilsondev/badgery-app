import "dotenv/config";
import crypto from "node:crypto";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .optional(),
  PORT: z.coerce.number().int().positive().default(5000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}
const env = parsed.data;

if (env.NODE_ENV === "production" && !env.SESSION_SECRET) {
  console.error(
    "SESSION_SECRET is required in production. Generate one with: openssl rand -hex 32",
  );
  process.exit(1);
}

function ephemeralSecret(): string {
  console.warn(
    "SESSION_SECRET not set — using an ephemeral secret; sessions will not survive restarts.",
  );
  return crypto.randomBytes(32).toString("hex");
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET ?? ephemeralSecret(),
  port: env.PORT,
};
