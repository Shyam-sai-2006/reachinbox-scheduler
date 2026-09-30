import React from "react";
import { EmailMessageRecord } from "@reachinbox/shared";
import { Badge } from "./ui/Badge.js";
import { TableSkeleton } from "./ui/Skeleton.js";
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Calendar,
  ArrowLeft,
  ArrowRight,
  Mail,
} from "lucide-react";

interface SentTableProps {
  emails: EmailMessageRecord[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (newPage: number) => void;
  onRefresh: () => void;
}

export const SentTable: React.FC<SentTableProps> = ({
  emails,
  isLoading,
  page,
  totalPages,
  totalCount,
  onPageChange,
  onRefresh,
}) => {
  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Table Toolbar */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Sent Emails
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalCount} total completed deliveries and execution records
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 p-2 rounded-lg hover:bg-slate-50 transition-colors"
          title="Refresh table"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-indigo-600" : ""}`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table Body */}
      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : emails.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">
            No sent emails yet
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            As soon as scheduled emails reach their planned dispatch times and
            complete SMTP transmission, they will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-6">Recipient Email</th>
                <th className="py-3 px-6">Subject</th>
                <th className="py-3 px-6">Sent Time</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6 text-right">Delivery Channel / Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emails.map((email) => {
                const isFailed = email.status === "failed";
                const isSent = email.status === "sent";

                return (
                  <tr
                    key={email.id}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="py-3.5 px-6 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span
                          className="truncate max-w-[220px]"
                          title={email.recipient}
                        >
                          {email.recipient}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 text-slate-700">
                      <div>
                        <span
                          className="truncate max-w-[260px] block"
                          title={email.subject}
                        >
                          {email.subject}
                        </span>
                        {isFailed && email.failureReason && (
                          <div className="flex items-center gap-1 text-[11px] text-rose-600 mt-0.5">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            <span
                              className="truncate max-w-[240px]"
                              title={email.failureReason}
                            >
                              {email.failureReason}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-6 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {formatDateTime(email.sentAt || email.failedAt)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      <Badge variant={email.status as any}>
                        {email.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap">
                      {email.previewUrl ? (
                        <a
                          href={email.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 transition-colors"
                          title="Captured by Ethereal test sandbox. Add real SMTP to send directly to recipient inboxes."
                        >
                          <span>Ethereal Preview</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : isSent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Real Inbox Delivered</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
