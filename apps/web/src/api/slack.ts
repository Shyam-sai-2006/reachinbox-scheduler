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

  disconnect: async (): Promise<void> => {
    return apiClient<void>("/api/integrations/slack", { method: "DELETE" });
  },
};
