import { apiClient } from "./client.js";
import {
  EmailMessageRecord,
  PaginatedResult,
  ScheduleEmailResponseDTO,
  EmailStatus,
} from "@reachinbox/shared";

export const emailApi = {
  schedule: async (
    formData: FormData,
    idempotencyKey?: string,
  ): Promise<ScheduleEmailResponseDTO> => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    return apiClient<ScheduleEmailResponseDTO>("/api/emails/schedule", {
      method: "POST",
      body: formData,
      headers,
    });
  },

  list: async (params: {
    status?: EmailStatus;
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<PaginatedResult<EmailMessageRecord>> => {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.page) query.set("page", params.page.toString());
    if (params.pageSize) query.set("pageSize", params.pageSize.toString());
    if (params.search) query.set("search", params.search);

    return apiClient<PaginatedResult<EmailMessageRecord>>(
      `/api/emails?${query.toString()}`,
    );
  },

  getById: async (id: string): Promise<EmailMessageRecord> => {
    return apiClient<EmailMessageRecord>(`/api/emails/${id}`);
  },

  cancel: async (id: string): Promise<void> => {
    return apiClient<void>(`/api/emails/${id}/cancel`, { method: "POST" });
  },

  search: async (params: {
    q: string;
    status?: EmailStatus;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<EmailMessageRecord>> => {
    const query = new URLSearchParams();
    query.set("q", params.q);
    if (params.status) query.set("status", params.status);
    if (params.page) query.set("page", params.page.toString());
    if (params.pageSize) query.set("pageSize", params.pageSize.toString());

    return apiClient<PaginatedResult<EmailMessageRecord>>(
      `/api/emails/search?${query.toString()}`,
    );
  },
};
