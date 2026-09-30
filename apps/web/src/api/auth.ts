import { apiClient } from "./client.js";
import { UserProfile } from "@reachinbox/shared";

export const authApi = {
  getMe: async (): Promise<UserProfile> => {
    return apiClient<UserProfile>("/api/auth/me");
  },

  register: async (payload: {
    email: string;
    password: string;
    name?: string;
  }): Promise<UserProfile> => {
    return apiClient<UserProfile>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  login: async (payload: {
    email: string;
    password: string;
  }): Promise<UserProfile> => {
    return apiClient<UserProfile>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  googleDevLogin: async (
    email: string,
    name?: string,
  ): Promise<UserProfile> => {
    return apiClient<UserProfile>("/api/auth/google/dev-login", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    });
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

  getGoogleAuthUrl: (email?: string): string => {
    return email
      ? `/api/auth/google?email=${encodeURIComponent(email)}`
      : "/api/auth/google";
  },
};
