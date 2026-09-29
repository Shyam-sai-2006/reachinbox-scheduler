import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  ELASTICSEARCH_NODE: z.string().url().default("http://localhost:9200"),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),

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
});

export type WorkerEnvConfig = z.infer<typeof EnvSchema>;

let parsedConfig: WorkerEnvConfig;

try {
  parsedConfig = EnvSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error(
      "Worker environment validation failed:",
      JSON.stringify(error.format(), null, 2),
    );
  } else {
    console.error("Worker environment validation error:", error);
  }
  process.exit(1);
}

export const env = parsedConfig;
