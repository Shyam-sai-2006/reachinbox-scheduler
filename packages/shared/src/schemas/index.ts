import { z } from "zod";

export const ScheduleEmailFormSchema = z.object({
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(500, "Subject is too long"),
  body: z.string().min(1, "Body is required"),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Start time must be a valid ISO date string",
  }),
  delayMs: z.coerce
    .number()
    .int()
    .min(0, "Delay must be at least 0 ms")
    .max(86400000, "Delay too large (max 24h)"),
  hourlyLimit: z.coerce
    .number()
    .int()
    .positive("Hourly limit must be greater than 0")
    .max(10000, "Hourly limit max is 10000"),
});

export const EmailSearchSchema = z.object({
  q: z.string().optional(),
  status: z
    .enum(["scheduled", "sending", "sent", "failed", "cancelled"])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const EmailFilterSchema = z.object({
  status: z
    .enum(["scheduled", "sending", "sent", "failed", "cancelled"])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});
