import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

// Load .env from monorepo root
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config(); // fallback to current dir

const EtherealSenderSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean().default(false),
  user: z.string().min(1),
  pass: z.string().min(1),
});

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  ELASTICSEARCH_NODE: z.string().url().default("http://localhost:9200"),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_CALLBACK_URL: z.string().url(),

  SLACK_CLIENT_ID: z.string().min(1, "SLACK_CLIENT_ID is required"),
  SLACK_CLIENT_SECRET: z.string().min(1, "SLACK_CLIENT_SECRET is required"),
  SLACK_REDIRECT_URI: z.string().url(),

  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters"),
  APP_ENCRYPTION_KEY: z
    .string()
    .min(32, "APP_ENCRYPTION_KEY must be at least 32 characters"),

  ETHEREAL_SENDERS_JSON: z.string().default("[]"),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  MIN_SEND_DELAY_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce
    .number()
    .int()
    .positive()
    .default(200),

  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  BULL_BOARD_USER: z.string().default("admin"),
  BULL_BOARD_PASSWORD: z.string().default("admin_secure_password"),

  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let parsedConfig: EnvConfig;

try {
  parsedConfig = EnvSchema.parse(process.env);
  // Validate ETHEREAL_SENDERS_JSON format
  try {
    const parsedSenders = JSON.parse(parsedConfig.ETHEREAL_SENDERS_JSON);
    if (Array.isArray(parsedSenders)) {
      z.array(EtherealSenderSchema).parse(parsedSenders);
    }
  } catch (err: any) {
    console.warn(
      `[WARN] ETHEREAL_SENDERS_JSON parse warning: ${err.message}. Defaulting to dynamic sender fallback.`,
    );
  }
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error(
      "Environment validation failed:",
      JSON.stringify(error.format(), null, 2),
    );
  } else {
    console.error("Environment validation error:", error);
  }
  process.exit(1);
}

export const env = parsedConfig;
