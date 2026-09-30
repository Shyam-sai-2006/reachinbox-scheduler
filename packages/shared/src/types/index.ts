export type EmailStatus =
  "scheduled" | "sending" | "sent" | "failed" | "cancelled";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSenderInfo {
  id: string;
  email: string;
  displayName?: string | null;
  host: string;
  port: number;
  secure: boolean;
  active: boolean;
  isRealSmtp: boolean;
  createdAt: string;
}

export interface CampaignInfo {
  id: string;
  userId: string;
  subject: string;
  body: string;
  startAt: string;
  delayMs: number;
  hourlyLimit: number;
  totalEmails?: number;
  sentEmails?: number;
  failedEmails?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailMessageRecord {
  id: string;
  campaignId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  sequenceNumber: number;
  scheduledAt: string;
  status: EmailStatus;
  sentAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  attemptCount: number;
  deterministicMessageId: string;
  queueJobId: string;
  previewUrl?: string | null;
  indexedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEmailRequestDTO {
  subject: string;
  body: string;
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
}

export interface ScheduleEmailResponseDTO {
  campaignId: string;
  totalDetected: number;
  scheduledCount: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
}

export interface SlackConnectionStatusDTO {
  connected: boolean;
  teamName?: string | null;
  channelName?: string | null;
  connectedAt?: string | null;
}

export interface EmailSearchQueryDTO {
  q?: string;
  status?: EmailStatus;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QueueEmailSendPayload {
  emailMessageId: string;
  campaignId: string;
  senderId: string;
  userId: string;
  sequenceNumber: number;
  scheduledAt: string;
}

export interface QueueEmailIndexPayload {
  emailMessageId: string;
  action: "index" | "update" | "delete";
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
