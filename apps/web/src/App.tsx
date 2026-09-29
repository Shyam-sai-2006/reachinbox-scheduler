import React, { useState, useEffect } from "react";
import { UserProfile } from "@reachinbox/shared";
import { authApi } from "./api/auth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { Loader2 } from "lucide-react";

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const currentUser = await authApi.getMe();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setIsLoadingAuth(false);
      }
    }
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      setUser(null);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-indigo-100">
            R
          </div>
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mt-1" />
          <p className="text-xs font-medium text-slate-400">
            Loading ReachInbox...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
  }

  return <DashboardPage user={user} onLogout={handleLogout} />;
};
