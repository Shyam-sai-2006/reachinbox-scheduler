import React, { useState, useRef, useEffect } from "react";
import { parseEmailsFromText, EmailParseResult } from "@reachinbox/shared";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { emailApi } from "../api/emails.js";
import { sendersApi } from "../api/senders.js";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Users,
  Info,
} from "lucide-react";

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
  const [recipientText, setRecipientText] = useState("");
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
  const [hasRealSender, setHasRealSender] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if any real SMTP sender is configured
  useEffect(() => {
    if (isOpen) {
      sendersApi
        .list()
        .then((list) => {
          setHasRealSender(list.some((s) => s.active && s.isRealSmtp));
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Automatically parse whenever recipientText changes
  useEffect(() => {
    if (recipientText.trim()) {
      const res = parseEmailsFromText(recipientText);
      setParseResult(res);
    } else if (!selectedFile) {
      setParseResult(null);
    }
  }, [recipientText, selectedFile]);

  // Update default start time whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 1);
      const tzOffset = now.getTimezoneOffset() * 60000;
      setStartTime(
        new Date(now.getTime() - tzOffset).toISOString().slice(0, 16),
      );
    }
  }, [isOpen]);

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
        // Also populate the textarea for full visibility and editing
        setRecipientText(result.validEmails.join("\n"));
      }
    };
    reader.readAsText(file);
  };

  const handleResetFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    // Re-evaluate whatever text is currently in textarea
    if (recipientText.trim()) {
      setParseResult(parseEmailsFromText(recipientText));
    } else {
      setParseResult(null);
    }
  };

  const handleInsertSampleEmails = () => {
    const examples = [
      "sk0894@srmist.edu.in",
      "alex.sample@gmail.com",
      "partner@reachinbox.ai",
    ].join("\n");
    setRecipientText(examples);
    setParseResult(parseEmailsFromText(examples));
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    const currentLines = recipientText
      .split(/[\r\n,;\s]+/)
      .map((t) => t.trim())
      .filter((t) => t && t.toLowerCase() !== emailToRemove.toLowerCase());
    const updated = currentLines.join("\n");
    setRecipientText(updated);
    setParseResult(parseEmailsFromText(updated));
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
    if (!parseResult || parseResult.validEmails.length === 0) {
      onError(
        "Please provide at least one valid recipient email address (type or upload)",
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append("subject", subject.trim());
      formData.append("body", body.trim());

      // Parse start time; if in the past, adjust to now
      const parsedStart = new Date(startTime);
      const effectiveStart =
        parsedStart.getTime() < Date.now() ? new Date() : parsedStart;
      formData.append("startTime", effectiveStart.toISOString());
      formData.append("delayMs", delayMs.toString());
      formData.append("hourlyLimit", hourlyLimit.toString());

      // Recipient content
      const emailsPayload = parseResult.validEmails.join("\n");
      formData.append("recipientEmails", emailsPayload);

      if (selectedFile) {
        formData.append("file", selectedFile);
      } else {
        const textBlob = new Blob([emailsPayload], { type: "text/plain" });
        formData.append("file", textBlob, "recipients.txt");
      }

      // Client idempotency key
      const idempotencyKey = `sched-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const response = await emailApi.schedule(formData, idempotencyKey);

      onScheduledSuccess(
        `Successfully scheduled ${response.scheduledCount} email${response.scheduledCount > 1 ? "s" : ""}! (First send: ${new Date(response.startTime).toLocaleTimeString()})`,
      );

      // Reset form
      setSubject("");
      setBody("");
      setRecipientText("");
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

  const hasValidRecipients =
    parseResult !== null && parseResult.validEmails.length > 0;
  const isFormReady =
    subject.trim().length > 0 && body.trim().length > 0 && hasValidRecipients;

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
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi there,&#10;&#10;We're excited to introduce ReachInbox..."
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-slate-400 resize-y"
          />
        </div>

        {/* Recipient Input (Direct Typing + File Upload) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Recipient Email Addresses <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] font-normal text-slate-500 ml-1.5 hidden sm:inline">
                (Accepts any real emails: Gmail, Outlook, Work, etc.)
              </span>
            </div>
            <button
              type="button"
              onClick={handleInsertSampleEmails}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>+ Add Examples</span>
            </button>
          </div>

          {/* Text input for recipients */}
          <textarea
            rows={3}
            value={recipientText}
            onChange={(e) => setRecipientText(e.target.value)}
            placeholder="Type or paste any real recipient emails here (separated by commas, spaces, or newlines)...&#10;e.g. sk0894@srmist.edu.in, alex@gmail.com, team@company.com"
            className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-slate-400 font-mono text-xs resize-y"
          />

          {/* Real Email Tag Chips Preview */}
          {parseResult && parseResult.validEmails.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {parseResult.validEmails.slice(0, 10).map((em) => (
                <span
                  key={em}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{em}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(em)}
                    className="text-emerald-700 hover:text-rose-600 ml-0.5 rounded-full"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {parseResult.validEmails.length > 10 && (
                <span className="text-[10px] text-slate-500 self-center px-1 font-medium">
                  +{parseResult.validEmails.length - 10} more
                </span>
              )}
            </div>
          )}

          {/* Optional File Upload Dropzone */}
          <div className="mt-2">
            {!selectedFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-slate-300 hover:border-indigo-500 rounded-lg p-2.5 text-center cursor-pointer transition-colors bg-slate-50/60 hover:bg-indigo-50/30 group flex items-center justify-center gap-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,text/plain,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-indigo-700">
                  Or click to upload CSV / TXT file
                </span>
                <span className="text-[10px] text-slate-400">(up to 10MB)</span>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-900 truncate max-w-[240px] inline-block">
                      {selectedFile.name}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-1.5">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Live Validation Pill Badges */}
          {parseResult && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {parseResult.validEmails.length > 0 ? (
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    {parseResult.validEmails.length} valid recipient
                    {parseResult.validEmails.length > 1 ? "s" : ""} ready
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                  <Users className="w-3 h-3 text-slate-400" />
                  <span>No valid emails entered yet</span>
                </div>
              )}

              {parseResult.duplicateCount > 0 && (
                <span className="text-slate-500 text-[11px] bg-slate-100 px-2 py-0.5 rounded">
                  {parseResult.duplicateCount} duplicate
                  {parseResult.duplicateCount > 1 ? "s" : ""} deduplicated
                </span>
              )}

              {parseResult.invalidCount > 0 && (
                <span className="text-amber-700 bg-amber-50 border border-amber-200 text-[11px] px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  {parseResult.invalidCount} invalid address
                  {parseResult.invalidCount > 1 ? "es" : ""} skipped
                </span>
              )}
            </div>
          )}
        </div>

        {/* Scheduling & Rate Limiting Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="text-[11px]">
            {hasRealSender ? (
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Live Real Delivery (Emails land in actual inboxes)
              </span>
            ) : (
              <span className="text-amber-700 flex items-center gap-1 font-medium">
                <Info className="w-3.5 h-3.5 text-amber-500" />
                Sandbox Mode (Simulated). Click "Real Mail (SMTP)" to deliver to inboxes.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5 self-end sm:self-center">
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
              disabled={!isFormReady}
            >
              Schedule Campaign
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
