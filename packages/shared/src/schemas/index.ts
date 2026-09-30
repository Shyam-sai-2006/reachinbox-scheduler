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
  recipientEmails: z.string().optional(),
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

export const RegisterSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required").max(100).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const GoogleDevLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  name: z.string().optional(),
});

export const EmailSenderCreateSchema = z.object({
  email: z.string().email("Please enter a valid sender email address"),
  displayName: z.string().optional(),
  host: z.string().min(1, "SMTP host is required"),
  port: z.coerce.number().int().positive().default(587),
  secure: z.boolean().default(false),
  username: z.string().min(1, "SMTP username is required"),
  password: z.string().min(1, "SMTP password is required"),
  active: z.boolean().default(true),
});

export const EmailSenderTestSchema = z.object({
  targetEmail: z.string().email("Please enter a valid recipient email address"),
  senderId: z.string().optional(),
  host: z.string().optional(),
  port: z.coerce.number().int().positive().optional(),
  secure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
});


