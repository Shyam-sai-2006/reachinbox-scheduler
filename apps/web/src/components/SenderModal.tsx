import React, { useState, useEffect } from "react";
import { EmailSenderInfo } from "@reachinbox/shared";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { sendersApi } from "../api/senders.js";
import {
  Mail,
  Send,
  CheckCircle2,
  Trash2,
  Power,
  Info,
  Shield,
  HelpCircle,
} from "lucide-react";

interface SenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  userEmail?: string;
}

export const SenderModal: React.FC<SenderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
  userEmail = "sk0894@srmist.edu.in",
}) => {
  const [senders, setSenders] = useState<EmailSenderInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"list" | "add">("list");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Form State
  const [provider, setProvider] = useState<"gmail" | "brevo" | "outlook" | "custom">("gmail");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("ReachInbox Dispatcher");
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testRecipient, setTestRecipient] = useState(userEmail);

  // Testing modal / quick test prompt
  const [testingSenderId, setTestingSenderId] = useState<string | null>(null);

  const fetchSenders = async () => {
    try {
      setIsLoading(true);
      const data = await sendersApi.list();
      setSenders(data);
    } catch (err: any) {
      onError(err.message || "Failed to load email senders");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSenders();
      setTestRecipient(userEmail);
    }
  }, [isOpen, userEmail]);

  const handleProviderSelect = (selected: "gmail" | "brevo" | "outlook" | "custom") => {
    setProvider(selected);
    if (selected === "gmail") {
      setHost("smtp.gmail.com");
      setPort(587);
      setSecure(false);
      if (!email) setEmail("");
    } else if (selected === "brevo") {
      setHost("smtp-relay.brevo.com");
      setPort(587);
      setSecure(false);
    } else if (selected === "outlook") {
      setHost("smtp.office365.com");
      setPort(587);
      setSecure(false);
    } else {
      setHost("");
      setPort(587);
      setSecure(false);
    }
  };

  const handleCreateSender = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const created = await sendersApi.create({
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        host: host.trim(),
        port,
        secure,
        username: username.trim() || email.trim(),
        password: password.trim(),
        active: true,
      });

      onSuccess(
        `Real SMTP sender ${created.email} verified and enabled! Emails will now deliver to real inboxes.`,
      );
      setEmail("");
      setPassword("");
      setUsername("");
      setActiveTab("list");
      fetchSenders();
    } catch (err: any) {
      onError(err.message || "Failed to verify and add SMTP sender");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendLiveTest = async (senderId?: string) => {
    if (!testRecipient.trim()) {
      onError("Please enter a recipient email address for the test email");
      return;
    }

    try {
      setIsTesting(true);
      const payload = senderId
        ? { targetEmail: testRecipient.trim(), senderId }
        : {
            targetEmail: testRecipient.trim(),
            host: host.trim(),
            port,
            secure,
            username: username.trim() || email.trim(),
            password: password.trim(),
            email: email.trim(),
            displayName: displayName.trim(),
          };

      const result = await sendersApi.testSend(payload);
      if (result.previewUrl) {
        onSuccess(
          `Test email sent via Ethereal sandbox! Preview link available in logs.`,
        );
      } else {
        onSuccess(
          `Real test email sent to ${testRecipient}! Please check your real inbox / spam folder.`,
        );
      }
      setTestingSenderId(null);
    } catch (err: any) {
      onError(err.message || "Failed to send real test email");
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleSender = async (id: string) => {
    try {
      await sendersApi.toggle(id);
      fetchSenders();
    } catch (err: any) {
      onError(err.message || "Failed to toggle sender");
    }
  };

  const handleDeleteSender = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this sender identity?")) {
      return;
    }
    try {
      await sendersApi.delete(id);
      onSuccess("Sender removed successfully");
      fetchSenders();
    } catch (err: any) {
      onError(err.message || "Failed to delete sender");
    }
  };

  const hasRealActiveSender = senders.some((s) => s.active && s.isRealSmtp);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Senders & Real Mail Delivery"
      subtitle="Configure real SMTP accounts (Gmail, Brevo, Outlook, etc.) to deliver emails directly to real recipient inboxes"
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {/* Status Callout Banner */}
        <div
          className={`p-3.5 rounded-xl border flex items-start gap-3 ${
            hasRealActiveSender
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          {hasRealActiveSender ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-xs">
            <h4 className="font-bold">
              {hasRealActiveSender
                ? "Live Real Delivery Active"
                : "Simulation Sandbox Mode (Ethereal)"}
            </h4>
            <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
              {hasRealActiveSender
                ? "Your campaigns are routed through your verified real SMTP server and will land directly in real recipient mailboxes (Gmail, Outlook, etc.)."
                : "Emails are currently processed through Ethereal testing sandbox (which generates web preview URLs instead of delivering to external inboxes). Connect your Gmail or real SMTP below to send to real mailboxes!"}
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "list"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Configured Senders ({senders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("add")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "add"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            + Add Real Email Sender (Gmail / SMTP)
          </button>
        </div>

        {/* Senders List Tab */}
        {activeTab === "list" && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Loading sender identities...
              </div>
            ) : senders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No senders found. Please add a sender below.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {senders.map((s) => (
                  <div
                    key={s.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      s.active
                        ? s.isRealSmtp
                          ? "bg-emerald-50/40 border-emerald-200"
                          : "bg-slate-50 border-slate-200"
                        : "bg-slate-100/60 border-slate-200 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          s.isRealSmtp
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {s.displayName || s.email}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              s.isRealSmtp
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-amber-100 text-amber-800 border border-amber-300"
                            }`}
                          >
                            {s.isRealSmtp ? "REAL SMTP" : "ETHEREAL SANDBOX"}
                          </span>
                          {s.active ? (
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              Active
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
                              Paused
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {s.email}{" "}
                          <span className="text-slate-400">
                            • Host: {s.host}:{s.port}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        isLoading={isTesting && testingSenderId === s.id}
                        onClick={() => {
                          setTestingSenderId(s.id);
                          handleSendLiveTest(s.id);
                        }}
                        className="text-xs gap-1"
                        title="Send a real verification email to check your inbox"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send Test</span>
                      </Button>

                      <button
                        type="button"
                        onClick={() => handleToggleSender(s.id)}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          s.active
                            ? "text-emerald-700 hover:bg-emerald-100 border-emerald-300"
                            : "text-slate-400 hover:bg-slate-200 border-slate-300"
                        }`}
                        title={s.active ? "Pause this sender" : "Enable this sender"}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      {s.isRealSmtp && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSender(s.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete sender"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Test Recipient Field */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 text-[11px] font-medium">
                Test Email Recipient:
              </span>
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="sk0894@srmist.edu.in"
                className="text-xs px-2.5 py-1 rounded border border-slate-300 max-w-xs flex-1"
              />
            </div>
          </div>
        )}

        {/* Add Real Email Sender Form */}
        {activeTab === "add" && (
          <form onSubmit={handleCreateSender} className="space-y-3.5">
            {/* Provider presets */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Choose Provider Preset
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: "gmail", name: "Gmail" },
                  { id: "brevo", name: "Brevo" },
                  { id: "outlook", name: "Outlook" },
                  { id: "custom", name: "Custom" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderSelect(p.id as any)}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border text-center transition-all ${
                      provider === p.id
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Gmail Instruction Guide */}
            {provider === "gmail" && (
              <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-950 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
                  Sending via Gmail / Google Workspace:
                </p>
                <ol className="list-decimal list-inside space-y-0.5 text-indigo-900/90 pl-1">
                  <li>
                    Go to <strong>Google Account &gt; Security &gt; 2-Step Verification</strong>.
                  </li>
                  <li>
                    At the bottom, select <strong>App passwords</strong>.
                  </li>
                  <li>
                    Create an app named <em>ReachInbox</em> and copy the <strong>16-letter password</strong>.
                  </li>
                  <li>
                    Enter your Gmail address below and paste the 16-letter App Password.
                  </li>
                </ol>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Sender Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (!username) setUsername(e.target.value);
                  }}
                  placeholder="e.g. sk0894@srmist.edu.in or user@gmail.com"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Karthikeya"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  SMTP Host <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Port
                </label>
                <input
                  type="number"
                  required
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 587)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  SMTP Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  SMTP Password / App Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="16-character App Password"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setActiveTab("list")}
              >
                Back to Senders
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSaving}
                className="gap-2"
              >
                <Shield className="w-4 h-4" />
                <span>Verify & Activate Real Sender</span>
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
