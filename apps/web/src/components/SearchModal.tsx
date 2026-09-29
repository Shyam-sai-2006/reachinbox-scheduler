import React, { useState, useEffect } from "react";
import { EmailMessageRecord, EmailStatus } from "@reachinbox/shared";
import { emailApi } from "../api/emails.js";
import { Badge } from "./ui/Badge.js";
import { Search, Loader2, X, Mail, Calendar, ExternalLink } from "lucide-react";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmailStatus | undefined>(
    undefined,
  );
  const [results, setResults] = useState<EmailMessageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      if (!query.trim() && !statusFilter) {
        setResults([]);
        setTotal(0);
        return;
      }

      try {
        setIsLoading(true);
        const res = await emailApi.search({
          q: query.trim(),
          status: statusFilter,
          pageSize: 20,
        });
        setResults(res.items);
        setTotal(res.total);
      } catch (err: any) {
        console.error("Elasticsearch search error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, statusFilter, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="flex min-h-full items-start justify-center p-4 pt-16">
        <div
          className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Header Input */}
          <div className="p-4 border-b border-slate-200 flex items-center gap-3">
            <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipients, subjects, body via Elasticsearch..."
              className="w-full text-sm outline-none placeholder:text-slate-400"
            />
            {isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 flex-shrink-0" />
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Status:</span>
            {(["all", "scheduled", "sent", "failed"] as const).map((s) => {
              const isActive =
                (s === "all" && !statusFilter) || statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() =>
                    setStatusFilter(
                      s === "all" ? undefined : (s as EmailStatus),
                    )
                  }
                  className={`px-2.5 py-1 rounded-full capitalize font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {s}
                </button>
              );
            })}
            <span className="ml-auto text-[11px] text-slate-400">
              {total} match{total === 1 ? "" : "es"}
            </span>
          </div>

          {/* Results List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {results.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                {query || statusFilter
                  ? "No matching emails found in Elasticsearch index."
                  : "Type a recipient email, subject keyword, or body snippet to search."}
              </div>
            ) : (
              results.map((email) => (
                <div
                  key={email.id}
                  className="p-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {email.recipient}
                        </span>
                        <Badge variant={email.status as any}>
                          {email.status}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {email.subject}
                      </p>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                        {email.body}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {new Date(email.scheduledAt).toLocaleDateString()}
                        </span>
                      </div>
                      {email.previewUrl && (
                        <a
                          href={email.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline mt-1"
                        >
                          <span>Preview</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
