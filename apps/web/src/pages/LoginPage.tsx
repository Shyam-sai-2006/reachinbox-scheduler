import React, { useState } from "react";
import { UserProfile } from "@reachinbox/shared";
import { authApi } from "../api/auth.js";
import { Button } from "../components/ui/Button.js";
import { ShieldCheck, Zap, Server, Clock } from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleDemoLogin = async () => {
    try {
      setIsDemoLoading(true);
      setErrorMessage("");
      const user = await authApi.testLogin();
      onLoginSuccess(user);
    } catch (err: any) {
      setErrorMessage(err.message || "Demo login failed");
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Icon */}
        <div className="h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto shadow-lg shadow-indigo-100">
          R
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          ReachInbox
        </h2>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Outbox Labs — Full-stack Email Job Scheduler
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-100 sm:rounded-2xl sm:px-10 border border-slate-200/80">
          {errorMessage && (
            <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="space-y-4">
            {/* Real Google OAuth 2.0 Button */}
            <a
              href="/api/auth/google"
              className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {/* Google SVG Logo */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </a>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400 font-semibold tracking-wider">
                  Or instant local preview
                </span>
              </div>
            </div>

            {/* Quick Demo Login Button for Evaluator */}
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="w-full"
              isLoading={isDemoLoading}
              onClick={handleDemoLogin}
            >
              Sign in as Demo User
            </Button>
          </div>

          {/* Architecture Highlights */}
          <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 gap-3 text-left">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-slate-900">
                  Delayed BullMQ
                </p>
                <p className="text-[10px] text-slate-500">
                  Zero cron / zero timers
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-slate-900">
                  Redis Lua Limiter
                </p>
                <p className="text-[10px] text-slate-500">
                  Atomic sender quotas
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Server className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-slate-900">
                  PostgreSQL + ES
                </p>
                <p className="text-[10px] text-slate-500">
                  Full-text search synced
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-slate-900">
                  Slack Webhook
                </p>
                <p className="text-[10px] text-slate-500">Hourly rate alerts</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
