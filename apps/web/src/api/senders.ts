import { apiClient } from "./client.js";
import { EmailSenderInfo } from "@reachinbox/shared";

export interface CreateSenderPayload {
  email: string;
  displayName?: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  active?: boolean;
}

export interface TestSenderPayload {
  targetEmail: string;
  senderId?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  email?: string;
  displayName?: string;
}

export const sendersApi = {
  list: async (): Promise<EmailSenderInfo[]> => {
    return apiClient<EmailSenderInfo[]>("/api/senders");
  },

  create: async (payload: CreateSenderPayload): Promise<EmailSenderInfo> => {
    return apiClient<EmailSenderInfo>("/api/senders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  testSend: async (
    payload: TestSenderPayload,
  ): Promise<{ success: boolean; previewUrl?: string | null }> => {
    return apiClient<{ success: boolean; previewUrl?: string | null }>(
      "/api/senders/test",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  toggle: async (id: string): Promise<{ id: string; active: boolean }> => {
    return apiClient<{ id: string; active: boolean }>(
      `/api/senders/${id}/toggle`,
      {
        method: "PATCH",
      },
    );
  },

  delete: async (id: string): Promise<void> => {
    return apiClient<void>(`/api/senders/${id}`, {
      method: "DELETE",
    });
  },
};
