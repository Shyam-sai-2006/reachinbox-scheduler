import { apiClient } from "./client.js";
import { UserProfile } from "@reachinbox/shared";

export const authApi = {
  getMe: async (): Promise<UserProfile> => {
    return apiClient<UserProfile>("/api/auth/me");
  },

  logout: async (): Promise<void> => {
    return apiClient<void>("/api/auth/logout", { method: "POST" });
  },

  testLogin: async (email?: string, name?: string): Promise<UserProfile> => {
    return apiClient<UserProfile>("/api/auth/test-login", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    });
  },

  getGoogleAuthUrl: (): string => {
    return "/api/auth/google";
  },
};
