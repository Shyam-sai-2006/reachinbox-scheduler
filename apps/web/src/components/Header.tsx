import React, { useState } from "react";
import { UserProfile, SlackConnectionStatusDTO } from "@reachinbox/shared";
import { slackApi } from "../api/slack.js";
import { LogOut, ExternalLink, Slack } from "lucide-react";

interface HeaderProps {
  user: UserProfile;
  slackStatus: SlackConnectionStatusDTO;
  onLogout: () => void;
  onRefreshSlack: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  slackStatus,
  onLogout,
  onRefreshSlack,
}) => {
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnectSlack = async () => {
    try {
      setIsDisconnecting(true);
      await slackApi.disconnect();
      onRefreshSlack();
    } catch (err: any) {
      console.error("Failed to disconnect Slack:", err);
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-indigo-100">
            R
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 tracking-tight text-base">
                ReachInbox
              </span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                Outbox Labs
              </span>
            </div>
          </div>
        </div>

        {/* Center / Bull Board Link */}
        <div className="hidden md:flex items-center gap-2">
          <a
            href="/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-100 transition-colors"
          >
            <span>Live Bull Board</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>

        {/* Right Action / Slack & Profile */}
        <div className="flex items-center gap-4">
          {/* Slack Connection Button/State */}
          {slackStatus.connected ? (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-3 py-1.5 rounded-lg text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline">
                Slack: #{slackStatus.channelName || "alerts"}
              </span>
              <button
                onClick={handleDisconnectSlack}
                disabled={isDisconnecting}
                title="Disconnect Slack Integration"
                className="text-emerald-700 hover:text-rose-600 underline font-normal ml-1 cursor-pointer"
              >
                {isDisconnecting ? "..." : "Disconnect"}
              </button>
            </div>
          ) : (
            <a
              href="/api/integrations/slack/connect"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
            >
              <Slack className="w-3.5 h-3.5 text-[#ECB22E]" />
              <span>Connect Slack</span>
            </a>
          )}

          {/* User Profile Info */}
          <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="flex items-center gap-2.5">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.name}
                </p>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {user.email}
                </p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              title="Logout"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
