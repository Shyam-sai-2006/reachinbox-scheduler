import { apiClient } from "./client.js";
import { SlackConnectionStatusDTO } from "@reachinbox/shared";

export const slackApi = {
  getStatus: async (): Promise<SlackConnectionStatusDTO> => {
    return apiClient<SlackConnectionStatusDTO>(
      "/api/integrations/slack/status",
    );
  },

  getConnectUrl: (): string => {
    return "/api/integrations/slack/connect";
  },

  connectWebhook: async (payload: {
    webhookUrl: string;
    channelName?: string;
    teamName?: string;
  }): Promise<{ teamName: string; channelName: string }> => {
    return apiClient<{ teamName: string; channelName: string }>(
      "/api/integrations/slack/webhook",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  testAlert: async (): Promise<{ delivered: boolean; message: string }> => {
    return apiClient<{ delivered: boolean; message: string }>(
      "/api/integrations/slack/test-alert",
      {
        method: "POST",
      },
    );
  },

  disconnect: async (): Promise<void> => {
    return apiClient<void>("/api/integrations/slack", { method: "DELETE" });
  },
};

