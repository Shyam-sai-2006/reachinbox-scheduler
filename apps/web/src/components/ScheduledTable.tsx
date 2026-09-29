import React from "react";
import { EmailMessageRecord } from "@reachinbox/shared";
import { Badge } from "./ui/Badge.js";
import { TableSkeleton } from "./ui/Skeleton.js";
import {
  Clock,
  RefreshCw,
  XCircle,
  Calendar,
  ArrowLeft,
  ArrowRight,
  Mail,
} from "lucide-react";

interface ScheduledTableProps {
  emails: EmailMessageRecord[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (newPage: number) => void;
  onRefresh: () => void;
  onCancelEmail: (id: string) => void;
}

export const ScheduledTable: React.FC<ScheduledTableProps> = ({
  emails,
  isLoading,
  page,
  totalPages,
  totalCount,
  onPageChange,
  onRefresh,
  onCancelEmail,
}) => {
  const formatDateTime = (dateStr: string) => {
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
            Scheduled Emails
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalCount} {totalCount === 1 ? "email" : "emails"} queued for
            future dispatch
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
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">
            No scheduled emails
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            You don't have any emails currently waiting in the schedule queue.
            Click "Compose New Email" to queue a batch.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-6">Recipient Email</th>
                <th className="py-3 px-6">Subject</th>
                <th className="py-3 px-6">Scheduled Time</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emails.map((email) => (
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
                    <span
                      className="truncate max-w-[260px] block"
                      title={email.subject}
                    >
                      {email.subject}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-slate-500 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDateTime(email.scheduledAt)}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-6 whitespace-nowrap">
                    <Badge variant={email.status as any}>{email.status}</Badge>
                  </td>
                  <td className="py-3.5 px-6 text-right whitespace-nowrap">
                    <button
                      onClick={() => onCancelEmail(email.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                      title="Cancel this scheduled send"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
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
