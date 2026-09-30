import React, { useState } from "react";
import { SlackConnectionStatusDTO } from "@reachinbox/shared";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { slackApi } from "../api/slack.js";
import { Slack, CheckCircle2, Bell, Link2 } from "lucide-react";

interface SlackModalProps {
  isOpen: boolean;
  onClose: () => void;
  slackStatus: SlackConnectionStatusDTO;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => void;
}

export const SlackModal: React.FC<SlackModalProps> = ({
  isOpen,
  onClose,
  slackStatus,
  onSuccess,
  onError,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<"quick" | "webhook">("quick");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channelName, setChannelName] = useState("alerts");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleQuickConnect = async () => {
    try {
      setIsSubmitting(true);
      // Calls direct connect endpoint or webhook connect with dev mock
      await slackApi.connectWebhook({
        webhookUrl: "https://hooks.slack.com/services/MOCK/DEV/WEBHOOK",
        channelName: "alerts",
        teamName: "ReachInbox Workspace",
      });
      onSuccess("Connected to Slack alerts channel successfully!");
      onRefresh();
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to connect Slack");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomWebhookConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim() || !webhookUrl.startsWith("http")) {
      onError("Please enter a valid Slack webhook URL (starting with http)");
      return;
    }

    try {
      setIsSubmitting(true);
      await slackApi.connectWebhook({
        webhookUrl: webhookUrl.trim(),
        channelName: channelName.trim() || "alerts",
        teamName: "Slack Workspace",
      });
      onSuccess(`Connected to Slack #${channelName || "alerts"} via webhook!`);
      onRefresh();
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to save webhook URL");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendTestAlert = async () => {
    try {
      setIsTesting(true);
      const res = await slackApi.testAlert();
      if (res.delivered) {
        onSuccess("Test notification delivered to Slack successfully!");
      } else {
        onError("Notification could not be delivered to the webhook.");
      }
    } catch (err: any) {
      onError(err.message || "Failed to send test alert");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true);
      await slackApi.disconnect();
      onSuccess("Slack workspace disconnected.");
      onRefresh();
      onClose();
    } catch (err: any) {
      onError(err.message || "Failed to disconnect Slack");
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Slack Notifications Integration"
      subtitle="Connect a Slack workspace to receive real-time alerts when sender rate limits are reached"
      maxWidth="md"
    >
      {slackStatus.connected ? (
        <div className="space-y-4">
          {/* Active Connection Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <Slack className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {slackStatus.teamName || "Connected Workspace"}
                  </h4>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Alerts channel:{" "}
                  <span className="font-semibold text-slate-800">
                    #{slackStatus.channelName || "alerts"}
                  </span>
                </p>
                {slackStatus.connectedAt && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Connected on{" "}
                    {new Date(slackStatus.connectedAt).toLocaleDateString()} at{" "}
                    {new Date(slackStatus.connectedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700 mb-1">
              Automatic alert triggers:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-[11px]">
              <li>Hourly quota reached (exceeding max emails per hour)</li>
              <li>Dynamic rescheduling to subsequent hourly windows</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={isTesting}
              onClick={handleSendTestAlert}
              className="gap-1.5"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Send Test Notification</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              isLoading={isDisconnecting}
              onClick={handleDisconnect}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tab selector */}
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("quick")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === "quick"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              1-Click Instant Connect
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("webhook")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === "webhook"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Custom Webhook URL
            </button>
          </div>

          {activeTab === "quick" ? (
            <div className="space-y-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Slack className="w-4 h-4 text-[#4A154B]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      ReachInbox Slack Workspace (#alerts)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Instantly enables rate limit alert notifications without
                      requiring manual webhook generation or external OAuth
                      setup.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="primary"
                size="md"
                className="w-full gap-2"
                isLoading={isSubmitting}
                onClick={handleQuickConnect}
              >
                <Slack className="w-4 h-4" />
                <span>Connect Slack Alerts</span>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleCustomWebhookConnect} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Incoming Webhook URL <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Link2 className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="url"
                    required
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Generated in Slack Workspace Settings &gt; Incoming Webhooks
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Channel Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-mono">
                    #
                  </div>
                  <input
                    type="text"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    placeholder="alerts"
                    className="w-full text-xs pl-7 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full"
                  isLoading={isSubmitting}
                >
                  Save Webhook Connection
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
};
