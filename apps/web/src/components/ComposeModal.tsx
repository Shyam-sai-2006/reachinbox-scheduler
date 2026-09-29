import React, { useState, useRef } from "react";
import { parseEmailsFromText, EmailParseResult } from "@reachinbox/shared";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { emailApi } from "../api/emails.js";
import { Upload, FileText, CheckCircle2, AlertTriangle, X } from "lucide-react";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduledSuccess: (summary: string) => void;
  onError: (message: string) => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onScheduledSuccess,
  onError,
}) => {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [startTime, setStartTime] = useState(() => {
    // Current local time formatted for datetime-local input
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(200);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<EmailParseResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const result = parseEmailsFromText(text);
        setParseResult(result);
      }
    };
    reader.readAsText(file);
  };

  const handleResetFile = () => {
    setSelectedFile(null);
    setParseResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject.trim()) {
      onError("Subject is required");
      return;
    }
    if (!body.trim()) {
      onError("Email body is required");
      return;
    }
    if (!selectedFile) {
      onError("Please upload a CSV or TXT file containing email addresses");
      return;
    }
    if (!parseResult || parseResult.validEmails.length === 0) {
      onError("No valid email addresses detected in the uploaded file");
      return;
    }

    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append("subject", subject.trim());
      formData.append("body", body.trim());
      // Convert local datetime to UTC ISO string
      formData.append("startTime", new Date(startTime).toISOString());
      formData.append("delayMs", delayMs.toString());
      formData.append("hourlyLimit", hourlyLimit.toString());
      formData.append("file", selectedFile);

      // Client idempotency key
      const idempotencyKey = `sched-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const response = await emailApi.schedule(formData, idempotencyKey);

      onScheduledSuccess(
        `Successfully scheduled ${response.scheduledCount} emails! (First send: ${new Date(response.startTime).toLocaleTimeString()})`,
      );

      // Reset form
      setSubject("");
      setBody("");
      handleResetFile();
      onClose();
    } catch (err: any) {
      console.error("Schedule submission error:", err);
      onError(
        err.message ||
          "Unable to schedule emails. Please check inputs and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose New Email Campaign"
      subtitle="Configure subject, content, recipient list, and delayed queue dispatch parameters"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Subject */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Subject <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Announcing ReachInbox 2.0 Early Access"
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Body */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Email Body <span className="text-rose-500">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi there,&#10;&#10;We're excited to introduce ReachInbox..."
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-slate-400 resize-y"
          />
        </div>

        {/* File Upload Dropzone */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Recipient List (CSV / TXT) <span className="text-rose-500">*</span>
          </label>

          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-5 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-indigo-50/30 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/plain,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-600 mx-auto mb-1.5 transition-colors" />
              <p className="text-xs font-medium text-slate-700">
                Click or drag & drop a CSV or TXT file here
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Comma-separated or newline-separated recipient emails (up to
                10MB)
              </p>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 truncate max-w-[280px]">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Client-side parsing preview (Requirement 25) */}
              {parseResult && (
                <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {parseResult.validEmails.length} email addresses detected
                    </span>
                  </div>
                  {parseResult.duplicateCount > 0 && (
                    <span className="text-slate-500 text-[11px]">
                      ({parseResult.duplicateCount} duplicate
                      {parseResult.duplicateCount > 1 ? "s" : ""} skipped)
                    </span>
                  )}
                  {parseResult.invalidCount > 0 && (
                    <span className="text-amber-600 text-[11px] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {parseResult.invalidCount} invalid format
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scheduling & Rate Limiting Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Start Time */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Start Time
            </label>
            <input
              type="datetime-local"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Delay Between Emails */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Delay (ms)
            </label>
            <input
              type="number"
              min={0}
              max={86400000}
              step={100}
              value={delayMs}
              onChange={(e) => setDelayMs(parseInt(e.target.value) || 0)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {(delayMs / 1000).toFixed(1)}s between sends
            </span>
          </div>

          {/* Hourly Limit */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Hourly Limit
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(parseInt(e.target.value) || 1)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Max emails/hour per sender
            </span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            disabled={
              !selectedFile ||
              !parseResult ||
              parseResult.validEmails.length === 0
            }
          >
            Schedule Campaign
          </Button>
        </div>
      </form>
    </Modal>
  );
};
