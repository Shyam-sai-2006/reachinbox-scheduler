import React, { useState, useEffect, useCallback } from "react";
import {
  UserProfile,
  EmailMessageRecord,
  SlackConnectionStatusDTO,
} from "@reachinbox/shared";
import { Header } from "../components/Header.js";
import { ScheduledTable } from "../components/ScheduledTable.js";
import { SentTable } from "../components/SentTable.js";
import { ComposeModal } from "../components/ComposeModal.js";
import { SearchModal } from "../components/SearchModal.js";
import { ToastContainer, ToastMessage } from "../components/ui/Toast.js";
import { Button } from "../components/ui/Button.js";
import { emailApi } from "../api/emails.js";
import { slackApi } from "../api/slack.js";
import { Plus, Search, Clock, CheckCircle2 } from "lucide-react";

interface DashboardPageProps {
  user: UserProfile;
  onLogout: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<"scheduled" | "sent">("scheduled");

  // Scheduled table state
  const [scheduledEmails, setScheduledEmails] = useState<EmailMessageRecord[]>(
    [],
  );
  const [scheduledLoading, setScheduledLoading] = useState(true);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [scheduledTotalPages, setScheduledTotalPages] = useState(1);
  const [scheduledTotalCount, setScheduledTotalCount] = useState(0);

  // Sent table state
  const [sentEmails, setSentEmails] = useState<EmailMessageRecord[]>([]);
  const [sentLoading, setSentLoading] = useState(true);
  const [sentPage, setSentPage] = useState(1);
  const [sentTotalPages, setSentTotalPages] = useState(1);
  const [sentTotalCount, setSentTotalCount] = useState(0);

  // Slack status
  const [slackStatus, setSlackStatus] = useState<SlackConnectionStatusDTO>({
    connected: false,
  });

  // Modals state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Toasts state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch Slack status
  const fetchSlackStatus = useCallback(async () => {
    try {
      const status = await slackApi.getStatus();
      setSlackStatus(status);
    } catch {
      setSlackStatus({ connected: false });
    }
  }, []);

  // Fetch Scheduled Emails
  const fetchScheduled = useCallback(
    async (page: number = scheduledPage, showLoader = false) => {
      if (showLoader) setScheduledLoading(true);
      try {
        const res = await emailApi.list({
          status: "scheduled",
          page,
          pageSize: 15,
        });
        setScheduledEmails(res.items);
        setScheduledTotalPages(res.totalPages);
        setScheduledTotalCount(res.total);
      } catch (err: any) {
        console.warn("Failed to load scheduled emails:", err.message);
      } finally {
        setScheduledLoading(false);
      }
    },
    [scheduledPage],
  );

  // Fetch Sent/Failed Emails
  const fetchSent = useCallback(
    async (page: number = sentPage, showLoader = false) => {
      if (showLoader) setSentLoading(true);
      try {
        // Sent list includes both 'sent' and 'failed'
        const [sentRes, failedRes] = await Promise.all([
          emailApi.list({ status: "sent", page, pageSize: 15 }),
          emailApi.list({ status: "failed", page, pageSize: 15 }),
        ]);

        const combined = [...sentRes.items, ...failedRes.items].sort((a, b) => {
          const timeA = new Date(
            a.sentAt || a.failedAt || a.updatedAt,
          ).getTime();
          const timeB = new Date(
            b.sentAt || b.failedAt || b.updatedAt,
          ).getTime();
          return timeB - timeA;
        });

        setSentEmails(combined.slice(0, 15));
        setSentTotalCount(sentRes.total + failedRes.total);
        setSentTotalPages(
          Math.max(sentRes.totalPages, failedRes.totalPages) || 1,
        );
      } catch (err: any) {
        console.warn("Failed to load sent emails:", err.message);
      } finally {
        setSentLoading(false);
      }
    },
    [sentPage],
  );

  // Initial load & URL params check
  useEffect(() => {
    fetchSlackStatus();
    fetchScheduled(1, true);
    fetchSent(1, true);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("slack") === "connected") {
      addToast(
        "success",
        "Slack workspace connected successfully! Rate limit alerts are active.",
      );
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get("slack_error")) {
      addToast(
        "error",
        `Slack connection failed: ${urlParams.get("slack_error")}`,
      );
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchSlackStatus, fetchScheduled, fetchSent]);

  // Keyboard shortcut '/' opens Elasticsearch search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Live polling for dashboard state (every 3 seconds) (Requirement 91)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchScheduled(activeTab === "scheduled" ? scheduledPage : 1, false);
      fetchSent(activeTab === "sent" ? sentPage : 1, false);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab, scheduledPage, sentPage, fetchScheduled, fetchSent]);

  // Cancel email handler
  const handleCancelEmail = async (id: string) => {
    try {
      await emailApi.cancel(id);
      addToast("info", "Scheduled email successfully cancelled.");
      fetchScheduled(scheduledPage, false);
    } catch (err: any) {
      addToast("error", err.message || "Failed to cancel email.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <Header
        user={user}
        slackStatus={slackStatus}
        onLogout={onLogout}
        onRefreshSlack={fetchSlackStatus}
        onToast={addToast}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          {/* Tabs: Scheduled vs Sent */}
          <div className="flex items-center p-1 bg-slate-200/60 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab("scheduled")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "scheduled"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Scheduled Emails</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold border border-slate-200">
                {scheduledTotalCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("sent")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "sent"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sent Emails</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold border border-slate-200">
                {sentTotalCount}
              </span>
            </button>
          </div>

          {/* Action Tools: Search & Compose */}
          <div className="flex items-center gap-3">
            {/* Search Trigger Button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 bg-white border border-slate-200 hover:border-slate-300 px-3.5 py-2 rounded-xl shadow-xs hover:bg-slate-50 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Search emails...</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded">
                /
              </kbd>
            </button>

            {/* Primary CTA: Compose New Email */}
            <Button
              variant="primary"
              size="md"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsComposeOpen(true)}
            >
              Compose New Email
            </Button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "scheduled" ? (
          <ScheduledTable
            emails={scheduledEmails}
            isLoading={scheduledLoading}
            page={scheduledPage}
            totalPages={scheduledTotalPages}
            totalCount={scheduledTotalCount}
            onPageChange={(p) => {
              setScheduledPage(p);
              fetchScheduled(p, true);
            }}
            onRefresh={() => fetchScheduled(scheduledPage, true)}
            onCancelEmail={handleCancelEmail}
          />
        ) : (
          <SentTable
            emails={sentEmails}
            isLoading={sentLoading}
            page={sentPage}
            totalPages={sentTotalPages}
            totalCount={sentTotalCount}
            onPageChange={(p) => {
              setSentPage(p);
              fetchSent(p, true);
            }}
            onRefresh={() => fetchSent(sentPage, true)}
          />
        )}
      </main>

      {/* Modals & Toasts */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onScheduledSuccess={(msg) => {
          addToast("success", msg);
          fetchScheduled(1, true);
          fetchSent(1, true);
        }}
        onError={(msg) => addToast("error", msg)}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
